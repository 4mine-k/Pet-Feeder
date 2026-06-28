#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <ESP32Servo.h>
#include <Preferences.h>
#include <time.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

#define WIFI_SSID "4mine"
#define WIFI_PASS "987654321"
#define API_KEY "AIzaSyD7R9KlqbLPw6cFwVJmdeDdQiRc9JZN9gU"
#define DB_URL "https://pet-feeder-e8541-default-rtdb.europe-west1.firebasedatabase.app"

const int trigPin = 5;
const int echoPin = 17;
const int irPin = 23;
const int servoPin = 13;

const int maxDistance = 20;
const int minLevelToFeed = 20;

long foodLevel;
unsigned long lastCheck = 0;
unsigned long lastFirebaseRead = 0;

int scheduleSlots[10];
int scheduleCount = 0;
int lastFedSlot = -1;
int prevDay = -1;
int currentTimeMin = -1;
bool scheduleLoaded = false;

Servo servo;
Preferences prefs;
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
bool firebaseReady = false;

void executeMeal() {
  Serial.println(">>> FEEDING");
  servo.write(180);
  delay(5000);
  servo.write(90);
  struct tm t;
  int nowMin = -1;
  if (getLocalTime(&t)) {
    nowMin = t.tm_hour * 60 + t.tm_min;
  } else if (currentTimeMin >= 0) {
    nowMin = currentTimeMin;
  }
  if (nowMin >= 0) {
    Firebase.RTDB.setInt(&fbdo, "/lastFeed", nowMin);
  }
  Serial.println(">>> DONE");
}

long getDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  return pulseIn(echoPin, HIGH, 30000) * 0.034 / 2;
}

int getCurrentMealSlot() {
  if (scheduleCount == 0) return -1;
  int nowMin = -1;
  struct tm t;
  if (getLocalTime(&t)) {
    nowMin = t.tm_hour * 60 + t.tm_min;
  } else if (currentTimeMin >= 0) {
    nowMin = currentTimeMin;
  } else {
    return -1;
  }
  for (int i = 0; i < scheduleCount; i++) {
    int start = scheduleSlots[i];
    int end = (i + 1 < scheduleCount) ? scheduleSlots[i + 1] : 1440;
    if (nowMin >= start && nowMin < end) return i;
  }
  return -1;
}

void parseSchedule(String data) {
  int newSlots[10];
  int newCount = 0;
  int start = 0;
  for (int i = 0; i <= (int)data.length(); i++) {
    if (i == (int)data.length() || data[i] == ',') {
      String t = data.substring(start, i);
      if (t.length() >= 5) {
        int h = t.substring(0, 2).toInt();
        int m = t.substring(3, 5).toInt();
        newSlots[newCount++] = h * 60 + m;
      }
      start = i + 1;
      if (newCount >= 10) break;
    }
  }
  for (int i = 0; i < newCount - 1; i++)
    for (int j = i + 1; j < newCount; j++)
      if (newSlots[j] < newSlots[i]) {
        int tmp = newSlots[i];
        newSlots[i] = newSlots[j];
        newSlots[j] = tmp;
      }
  bool changed = (newCount != scheduleCount);
  if (!changed) {
    for (int i = 0; i < newCount; i++)
      if (newSlots[i] != scheduleSlots[i]) { changed = true; break; }
  }
  for (int i = 0; i < newCount; i++) scheduleSlots[i] = newSlots[i];
  scheduleCount = newCount;
  if (changed) {
    if (scheduleLoaded) {
      lastFedSlot = -1;
      prefs.putInt("slot", -1);
    }
    scheduleLoaded = true;
    Serial.print("Schedule updated: ");
    for (int i = 0; i < scheduleCount; i++) {
      Serial.print(scheduleSlots[i]);
      Serial.print(" ");
    }
    Serial.println();
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("=== PET FEEDER + FIREBASE ===");

  prefs.begin("feeder", false);
  lastFedSlot = prefs.getInt("slot", -1);
  prevDay = prefs.getInt("day", -1);
  Serial.print("Restored slot: "); Serial.println(lastFedSlot);

  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(irPin, INPUT);

  ESP32PWM::allocateTimer(0);
  servo.setPeriodHertz(50);
  servo.attach(servoPin, 500, 2400);
  servo.write(90);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" OK: " + WiFi.localIP().toString());

  configTime(3600, 0, "pool.ntp.org", "time.google.com");
  delay(2000);
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    Serial.printf("Time: %02d:%02d\n", timeinfo.tm_hour, timeinfo.tm_min);
  } else {
    Serial.println("NTP failed, using website time.");
  }

  config.api_key = API_KEY;
  config.database_url = DB_URL;
  config.token_status_callback = tokenStatusCallback;
  Firebase.signUp(&config, &auth, "", "");
  Firebase.begin(&config, &auth);
  Firebase.reconnectNetwork(true);
  firebaseReady = true;
  Serial.println("Firebase OK");
}

void loop() {
  if (!firebaseReady || !Firebase.ready()) return;

  if (millis() - lastCheck >= 2000) {
    lastCheck = millis();

    long dist = getDistance();
    foodLevel = constrain(((maxDistance - dist) * 100L) / maxDistance, 0, 100);
    int ir = digitalRead(irPin);

    Serial.print("Dist: "); Serial.print(dist);
    Serial.print("cm | Level: "); Serial.print(foodLevel);
    Serial.print("% | IR: "); Serial.print(ir);
    Serial.print(" | Slot: "); Serial.println(getCurrentMealSlot());

    FirebaseJson json;
    json.set("foodLevel", (int)foodLevel);
    json.set("petDetected", ir == 0 ? 1 : 0);
    Firebase.RTDB.updateNode(&fbdo, "/", &json);

    struct tm t;
    if (getLocalTime(&t)) {
      if (prevDay != -1 && t.tm_mday != prevDay) {
        lastFedSlot = -1;
        prefs.putInt("slot", -1);
      }
      prevDay = t.tm_mday;
      prefs.putInt("day", prevDay);
    }

    if (ir == 0 && foodLevel > minLevelToFeed) {
      int slot = getCurrentMealSlot();
      if (slot >= 0 && slot != lastFedSlot) {
        Serial.println("Auto feed: pet in meal window!");
        executeMeal();
        lastFedSlot = slot;
        prefs.putInt("slot", lastFedSlot);
      } else if (slot >= 0 && slot == lastFedSlot) {
        Serial.println("Pet detected but already fed in this time window.");
      }
    }
  }

  if (millis() - lastFirebaseRead >= 3000) {
    lastFirebaseRead = millis();

    if (Firebase.RTDB.getInt(&fbdo, "/feedNow")) {
      if (fbdo.intData() == 1) {
        Firebase.RTDB.setInt(&fbdo, "/feedNow", 0);
        executeMeal();
      }
    }

    if (Firebase.RTDB.getString(&fbdo, "/schedule")) {
      String sched = fbdo.stringData();
      if (sched.length() > 0) {
        parseSchedule(sched);
      }
    }

    if (Firebase.RTDB.getInt(&fbdo, "/currentTime")) {
      currentTimeMin = fbdo.intData();
    }
  }
}