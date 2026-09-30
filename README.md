# MotoCare PMS & Upgrade Center

A small business appointment system for a motorcycle service shop. Customers can register, log in, save their motorcycle plate number with an appointment, and choose a PMS or Upgrade schedule.

## Business

**MotoCare PMS & Upgrade Center**

### Problem being solved
Motorcycle customers often need to contact the shop manually to ask about service schedules. This system gives the shop a simple online booking workflow and keeps appointment information in one database.

### Users
- **Customer** — registers, logs in, creates appointments, views their appointments, edits them, and deletes them with confirmation.
- **Admin** — can view all appointments, edit appointment status, and view registered users.

### Core CRUD entity
**Appointments**
- Create — request a PMS or Upgrade appointment.
- Read — customer sees their own appointments; admin sees all.
- Update — edit appointment information; admin can also update status.
- Delete — requires confirmation.

## Business hours and validation
- Monday–Friday: **8:00 AM–5:00 PM**
- Saturday: **8:00 AM–9:00 PM**
- Sunday: **Closed**
- Appointment slots are offered every 30 minutes.
- The server validates the day/time, not only the browser.
- A date/time slot can only be booked once.
- Past appointments are rejected.

## Tech stack
- Node.js
- Express
- SQLite via better-sqlite3
- bcryptjs for password hashing
- express-session for login sessions
- HTML, CSS, JavaScript

## Setup
1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run:
   ```bash
   npm install
   npm start
   ```
4. Open `http://localhost:3000`.

The SQLite database is automatically created in the `data/` folder.

## Demo accounts
These are created automatically on the first run:

**Admin**
- Email: `admin@motocare.local`
- Password: `admin123`

**Customer**
- Email: `customer@motocare.local`
- Password: `user123`

Change the demo credentials before deploying a real business system.

## AI disclosure
AI tools were used to help draft the initial website structure, styling, database logic, and JavaScript. The project owner should review, test, understand, and modify the generated code before submission.

## GitHub submission
Commit the complete source code and this README. Do not commit `node_modules/`, the SQLite database, passwords, API keys, or other secrets.
