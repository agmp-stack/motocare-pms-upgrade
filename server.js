const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "motocare.db"));
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    surname TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    motorcycle_plate TEXT NOT NULL,
    service_type TEXT NOT NULL CHECK(service_type IN ('PMS','Upgrade')),
    service_notes TEXT DEFAULT '',
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Confirmed','Completed','Cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(appointment_date, appointment_time)
  );
`);

const adminEmail = "admin@motocare.local";
const userEmail = "customer@motocare.local";

function ensureSeedUser(first_name, surname, phone, email, password, role) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (!existing) {
    const hash = bcrypt.hashSync(password, 12);
    db.prepare(`
      INSERT INTO users (first_name, surname, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(first_name, surname, phone, email, hash, role);
  }
}

ensureSeedUser("Admin", "Manager", "09170000000", adminEmail, "admin123", "admin");
ensureSeedUser("Juan", "Dela Cruz", "09171234567", userEmail, "user123", "customer");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "motocare-demo-session-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(express.static(path.join(__dirname, "public")));

function clean(value) {
  return String(value ?? "").trim();
}

function isValidPhone(phone) {
  return /^[0-9+()\- ]{7,20}$/.test(phone);
}

function isValidDate(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;
  const d = new Date(`${dateText}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateText;
}

function isValidAppointmentSlot(dateText, timeText) {
  if (!isValidDate(dateText) || !/^\d{2}:\d{2}$/.test(timeText)) return false;

  const [hour, minute] = timeText.split(":").map(Number);
  if (minute !== 0 && minute !== 30) return false;

  const day = new Date(`${dateText}T00:00:00`).getDay(); // Sun=0, Sat=6
  if (day === 0) return false;

  const minutes = hour * 60 + minute;
  if (day === 6) return minutes >= 8 * 60 && minutes <= 21 * 60;
  return minutes >= 8 * 60 && minutes <= 17 * 60;
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Please log in first." });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

function publicUser(user) {
  return {
    id: user.id,
    first_name: user.first_name,
    surname: user.surname,
    phone: user.phone,
    email: user.email,
    role: user.role
  };
}

// Authentication
app.post("/api/register", (req, res) => {
  const firstName = clean(req.body.firstName);
  const surname = clean(req.body.surname);
  const phone = clean(req.body.phone);
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || "");

  if (!firstName || !surname || !phone || !email || !password) {
    return res.status(400).json({ error: "All registration fields are required." });
  }
  if (!isValidPhone(phone)) return res.status(400).json({ error: "Enter a valid contact number." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  try {
    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare(`
      INSERT INTO users (first_name, surname, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?, 'customer')
    `).run(firstName, surname, phone, email, hash);

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    req.session.user = publicUser(user);
    res.json({ user: req.session.user });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "That email is already registered." });
    }
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post("/api/login", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  req.session.user = publicUser(user);
  res.json({ user: req.session.user });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

// Appointment CRUD
app.get("/api/appointments", requireAuth, (req, res) => {
  const isAdmin = req.session.user.role === "admin";
  const sql = isAdmin
    ? `SELECT a.*, u.first_name, u.surname, u.phone, u.email
       FROM appointments a JOIN users u ON u.id = a.user_id
       ORDER BY a.appointment_date, a.appointment_time`
    : `SELECT a.*, u.first_name, u.surname, u.phone, u.email
       FROM appointments a JOIN users u ON u.id = a.user_id
       WHERE a.user_id = ?
       ORDER BY a.appointment_date, a.appointment_time`;

  const rows = isAdmin ? db.prepare(sql).all() : db.prepare(sql).all(req.session.user.id);
  res.json({ appointments: rows });
});

app.post("/api/appointments", requireAuth, (req, res) => {
  const plate = clean(req.body.plateNumber).toUpperCase();
  const serviceType = clean(req.body.serviceType);
  const notes = clean(req.body.notes);
  const date = clean(req.body.date);
  const time = clean(req.body.time);

  if (!plate || !["PMS", "Upgrade"].includes(serviceType) || !isValidAppointmentSlot(date, time)) {
    return res.status(400).json({
      error: "Choose a valid service, date, and time. Weekdays: 8:00 AM–5:00 PM; Saturday: 8:00 AM–9:00 PM; Sunday is unavailable."
    });
  }

  const chosen = new Date(`${date}T${time}:00`);
  if (chosen < new Date()) return res.status(400).json({ error: "Please choose a future appointment." });

  try {
    const result = db.prepare(`
      INSERT INTO appointments
      (user_id, motorcycle_plate, service_type, service_notes, appointment_date, appointment_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.session.user.id, plate, serviceType, notes, date, time);

    res.status(201).json({
      appointment: db.prepare("SELECT * FROM appointments WHERE id = ?").get(result.lastInsertRowid)
    });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "That date and time is already booked. Please choose another slot." });
    }
    res.status(500).json({ error: "Could not create appointment." });
  }
});

app.put("/api/appointments/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Appointment not found." });

  const allowed = req.session.user.role === "admin" || existing.user_id === req.session.user.id;
  if (!allowed) return res.status(403).json({ error: "You can only update your own appointments." });

  const plate = clean(req.body.plateNumber).toUpperCase();
  const serviceType = clean(req.body.serviceType);
  const notes = clean(req.body.notes);
  const date = clean(req.body.date);
  const time = clean(req.body.time);
  const status = clean(req.body.status) || existing.status;

  if (!plate || !["PMS", "Upgrade"].includes(serviceType) || !isValidAppointmentSlot(date, time)) {
    return res.status(400).json({ error: "Invalid appointment information." });
  }
  if (!["Pending", "Confirmed", "Completed", "Cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  try {
    db.prepare(`
      UPDATE appointments
      SET motorcycle_plate = ?, service_type = ?, service_notes = ?,
          appointment_date = ?, appointment_time = ?, status = ?
      WHERE id = ?
    `).run(plate, serviceType, notes, date, time, status, id);

    res.json({ appointment: db.prepare("SELECT * FROM appointments WHERE id = ?").get(id) });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "That date and time is already booked." });
    }
    res.status(500).json({ error: "Could not update appointment." });
  }
});

app.delete("/api/appointments/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Appointment not found." });

  const allowed = req.session.user.role === "admin" || existing.user_id === req.session.user.id;
  if (!allowed) return res.status(403).json({ error: "You can only delete your own appointments." });

  db.prepare("DELETE FROM appointments WHERE id = ?").run(id);
  res.json({ ok: true });
});

// Admin user list
app.get("/api/users", requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, first_name, surname, phone, email, role, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json({ users });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`MotoCare PMS & Upgrade Center running at http://localhost:${PORT}`);
});
