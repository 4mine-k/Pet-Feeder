#define BLYNK_TEMPLATE_ID "TMPL2YYqBCikK"
#define BLYNK_TEMPLATE_NAME "Pet feeder"
#define BLYNK_AUTH_TOKEN "X-JtzuiZwSBKme2xwuqXuT2h_FPaIE-z"

#include <WiFi.h>
#include <WiFiClient.h>
#include <BlynkSimpleEsp32.h>
#include <ESP32Servo.h>

// Your WiFi Credentials
char ssid[] = "YOUR_WIFI_NAME";
char pass[] = "YOUR_WIFI_PASSWORD";

// Pin Definitions
const int trigPin = 5;
const int echoPin = 17;
const int irpin = 23;
const int servoPin = 4;

// Variables
int distanceres = 30; // Maximum distance to empty hopper in cm
long pourcentage;
int ir;

// *** THE COOLDOWN TIMER VARIABLES ***
unsigned long lastFeedTime = 0; 
// Set how long to wait between automatic meals (in milliseconds)
// 1000 * 60 * 60 = 1 Hour. (Currently set to 2 hours)
unsigned long cooldownPeriod = 1000UL * 60UL * 60UL * 2UL; 

Servo servo1;
BlynkTimer timer;

void setup() {
  Serial.begin(115200);

  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(irpin, INPUT);

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  servo1.setPeriodHertz(50);
  servo1.attach(servoPin, 500, 2400);
  servo1.write(0); 

  Blynk.begin(BLYNK_AUTH_TOKEN, ssid, pass);

  // Read sensors every 2 seconds
  timer.setInterval(2000L, readSensors);
}

void loop() {
  Blynk.run();
  timer.run();
}

// -----------------------------------------------------------------
// The Servo Action
// -----------------------------------------------------------------
void executeMeal() {
  Serial.println("Dispensing food now...");
  servo1.write(180);
  delay(5000); // 5 seconds open
  servo1.write(0);
  Serial.println("Feeding complete.");
  
  // Reset the stopwatch to right NOW
  lastFeedTime = millis(); 
}

// -----------------------------------------------------------------
// Sensor Reading & 24/7 AUTOMATIC Logic
// -----------------------------------------------------------------
void readSensors() {
  long distance = getDistance();
  pourcentage = ((30 - distance) * 100) / distanceres;
  if (pourcentage > 100) pourcentage = 100;
  if (pourcentage < 0) pourcentage = 0;

  ir = digitalRead(irpin);
  Blynk.virtualWrite(V2, pourcentage); 

  // AUTOMATIC CHECK: Is the pet here? AND is there enough food (> 20%)?
  if (ir == 0 && pourcentage > 20) {
    
    // Check if the cooldown period has finished, OR if it's the first time turning on
    if (millis() - lastFeedTime >= cooldownPeriod || lastFeedTime == 0) {
      Serial.println("Pet detected and cooldown finished! Automatic feed triggered.");
      executeMeal();
    } else {
      // Pet is there, but they ate recently. Do nothing.
      // (Optional: Print a message to serial monitor)
      long minutesLeft = (cooldownPeriod - (millis() - lastFeedTime)) / 60000;
      Serial.print("Pet is hungry, but must wait ");
      Serial.print(minutesLeft);
      Serial.println(" more minutes.");
    }
  }
}

// -----------------------------------------------------------------
// MANUAL OVERRIDE (Your Web Button)
// -----------------------------------------------------------------
BLYNK_WRITE(V1) { 
  if (param.asInt() == 1) { 
    Serial.println("Manual Web Button Pressed!");
    executeMeal(); // Drops food immediately, ignoring the cooldown!
    Blynk.virtualWrite(V1, 0); 
  } 
}

long getDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(5);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000);
  return duration * 0.034 / 2;
}
