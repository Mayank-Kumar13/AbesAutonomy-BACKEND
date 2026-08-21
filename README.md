# ABES Autonomy — Backend API

REST API server for the ABES Autonomy student notes platform.

## Tech Stack

- **Runtime**: Node.js (ES modules)
- **Framework**: Express 5
- **Database**: MongoDB Atlas + Mongoose 8
- **Auth**: JWT + bcrypt
- **File Storage**: ImageKit (PDF hosting)
- **Security**: Helmet, CORS, rate limiting, mongo-sanitize, express-validator

## Quick Start

### 1. Install dependencies
```bash
cd CODE/BACKEND
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, and ImageKit credentials
```

### 3. Seed the database (optional)
```bash
npm run seed
```
This creates:
- Admin user: `admin@abesautonomy.com` / `admin123456`
- Student user: `ankit@email.com` / `student123`
- Sample notes for all subjects

### 4. Start the server
```bash
npm run dev    # Development with auto-restart
npm start      # Production
```

The API will be available at `http://localhost:5000/api`

## API Endpoints

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |

### Notes (Public)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes` | List notes (filters: branch, year, semester, resourceType, subject, unit, page, limit, sort) |
| GET | `/api/notes/search?q=` | Full-text search |
| GET | `/api/notes/:id` | Get single note |
| POST | `/api/notes/:id/view` | Increment view count |

### Notes (Admin)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/notes` | Create note |
| PATCH | `/api/notes/:id` | Update note |
| DELETE | `/api/notes/:id` | Delete note (+ ImageKit file) |

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/profile` | Get profile (auth required) |
| PATCH | `/api/auth/profile` | Update profile (auth required) |

### Upload (Admin)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload/pdf` | Upload PDF to ImageKit + create note |
| POST | `/api/upload/register` | Register existing ImageKit PDF |
| DELETE | `/api/upload/:fileId` | Delete from ImageKit |

### Meta
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meta/subjects` | Distinct subjects (filters: branch, year, resourceType) |
| GET | `/api/meta/branches` | Distinct branches |
| GET | `/api/meta/stats` | Platform statistics (admin only) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| MONGODB_URI | ✅ | MongoDB connection string |
| JWT_SECRET | ✅ | JWT signing secret |
| JWT_EXPIRES_IN | | Token expiry (default: 7d) |
| IMAGEKIT_PUBLIC_KEY | | ImageKit public key |
| IMAGEKIT_PRIVATE_KEY | | ImageKit private key |
| IMAGEKIT_URL_ENDPOINT | | ImageKit URL endpoint |
| PORT | | Server port (default: 5000) |
| NODE_ENV | | Environment (default: development) |
| FRONTEND_URL | | CORS origin (default: http://localhost:5173) |

## Project Structure

```
src/
├── app.js              # Express app setup
├── server.js           # Entry point
├── config/
│   ├── db.js           # MongoDB connection
│   ├── env.js          # Environment variables
│   └── imagekit.js     # ImageKit SDK
├── controllers/        # Request handlers
├── middleware/          # Auth, validation, errors, rate limiting
├── models/             # Mongoose schemas
├── routes/             # Express routes
├── services/           # Business logic
├── utils/              # Response helpers
└── validators/         # Express-validator chains
```
