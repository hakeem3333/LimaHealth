# LimaHealth

LimaHealth is a digital health platform designed to support student wellness in schools. It enables schools to monitor student well‑being using wearable device data, mood check‑ins, and AI‑powered analysis. The system provides dashboards for school counselors and administrators, and tools for proactive intervention.

---

## 🚀 Features

* ✅ School onboarding with admin account
* ✅ Email verification & account activation workflow
* ✅ Student mood logging
* ✅ Biometric log ingestion (Fitbit integration)
* ✅ Alerts & notifications for at‑risk students
* ✅ Counselor dashboard & appointment booking
* ✅ Parent–student relationship support
* ✅ Multi‑role system (Admin, Counselor, Student, Parent)
* ✅ Subscription support

---

## 🏗️ Tech Stack

| Layer      | Technology               |
| ---------- | ------------------------ |
| Backend    | Node.js, Express         |
| Database   | PostgreSQL + Prisma ORM  |
| Auth       | JWT + Email Verification |

---

## 📦 Project Structure (Backend)

```
src/
 ├── controllers/
 ├── routes/
 ├── services/
 ├── middlewares/
 ├── prisma/
 └── server.ts
```

---

## ✅ Setup Instructions

### 1️⃣ Clone Repository

```
git clone https://github.com/hakeem3333/LimaHealth.git
cd LimaHealth
```

### 2️⃣ Install Dependencies

```
yarn install
# OR
npm install
```

### 3️⃣ Configure Environment Variables

Create a `.env` file:

```
DATABASE_URL="postgresql://user:password@localhost:5432/limahealth"
APP_URL="http://localhost:3000"
SESSION_SECRET="your_secret"
```

### 4️⃣ Run Database Migrations

```
npx prisma migrate dev
```

### 5️⃣ Start Server

```
yarn dev
# OR
npm run dev
```

Server now runs at:
➡️ `http://localhost:3000`

---

## 🔐 Authentication Flow

1. Admin signs up under a school
2. Email verification is required
3. Admin submits activation form
4. LimaHealth Support verifies & activates school
5. Admin can now onboard counselors + students

---

## 📬 API (Example)

### Signup

```
POST /api/v1/auth/signup
```

Body:

```
{
  "name": "Alpha School",
  "contact_email": "admin@alpha.com",
  "password": "123456"
}
```

---

## 📄 License

MIT

---

## 👩‍💻 Contributors

* LimaHealth Team

---

## API Routes

| Route Prefix                  | Description                    |
| ----------------------------- | ------------------------------ |
| /auth                         | Authentication & School Signup |
| /schools                      | School data management         |
| /subscriptions                | Subscription plans & billing   |
| /roles                        | User roles                     |
| /users                        | User management                |
| /counselor                    | Counselor management           |
| /biometric-logs               | Wearable data logs             |
| /mood-logs                    | Mood entries                   |
| /alerts                       | System alerts                  |
| /parent-student-relationships | Parent–student linking         |
| /consents                     | Consent forms                  |
| /fitbit                       | Fitbit integration             |

## Project Scripts

```
npm run dev      # start dev server
npm run build    # compile + merge schema
npm start        # run production build
```

## Technologies

* Node.js
* Express 5
* Prisma ORM
* Typescript
* JWT
* bcrypt
* express-session

## Environment Variables

Create a `.env` file in the project root:

```
# Server
PORT=3000
SESSION_SECRET=your_session_secret
NODE_ENV=development
APP_URL=http://localhost:3000

# Database
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME?schema=public"

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# Email
EMAIL_FROM="no-reply@yourdomain.com"
EMAIL_HOST=smtp.yourprovider.com
EMAIL_PORT=587
EMAIL_USER=your_smtp_username
EMAIL_PASS=your_smtp_password
```
