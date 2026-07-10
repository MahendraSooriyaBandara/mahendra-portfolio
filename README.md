# Mahendra Etampawala — Portfolio

Personal portfolio website with a small backend for managing CV and certifications
through an admin dashboard.

## Features

- **Public portfolio** (`index.html`) — hero, about, skills, experience, projects, education, contact form
- **Admin login** (`/admin`) — JWT-based authentication
- **Admin dashboard** (`/admin/dashboard`) — upload/replace CV, upload/delete certifications
- **Public downloads** — visitors can download the current CV and any published certifications
- **Contact form** — sends messages to your email via Web3Forms

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- npm (comes with Node.js)

## First-time setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables. Copy the example file and edit it:

   ```bash
   copy .env.example .env   # Windows
   # cp .env.example .env   # macOS/Linux
   ```

   Open `.env` and set:
   - `ADMIN_USERNAME` — your admin username
   - `ADMIN_PASSWORD` — a strong password
   - `JWT_SECRET` — a long random string (generate one with:
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)

## Run the server

```bash
npm start
```

Then open:

- **Public site** → http://localhost:3000/
- **Admin login** → http://localhost:3000/admin

## Admin workflow

1. Go to http://localhost:3000/admin
2. Log in with the credentials from your `.env` file
3. Upload your CV — it will immediately appear as a **Download CV** button in the hero on the public site
4. Upload certifications — a new **certifications.list** section appears on the public site with individual download links
5. Delete or replace files any time from the dashboard

## File storage

Uploaded files live in `server/uploads/` and metadata is tracked in
`server/data/db.json`. Both are ignored by git.

## Project structure

```
Mahendra/
├── index.html            # Public portfolio page
├── styles.css            # Public styles
├── script.js             # Public JavaScript (loads CV/certs from API)
├── package.json          # Node dependencies
├── .env                  # Environment variables (not committed)
├── .env.example          # Template for .env
├── admin/
│   ├── login.html
│   ├── dashboard.html
│   ├── admin.css
│   └── admin.js
└── server/
    ├── server.js         # Express entry point
    ├── lib/
    │   └── db.js         # JSON database helper
    ├── middleware/
    │   └── auth.js       # JWT verification middleware
    ├── routes/
    │   ├── auth.js       # /api/auth/* endpoints
    │   └── files.js      # /api/files/* endpoints
    ├── uploads/          # Uploaded files (created automatically)
    └── data/
        └── db.json       # Metadata (created automatically)
```

## API reference

| Method | Endpoint                        | Auth | Description                        |
| ------ | ------------------------------- | ---- | ---------------------------------- |
| POST   | `/api/auth/login`               | –    | Log in as admin                    |
| POST   | `/api/auth/logout`              | –    | Log out                            |
| GET    | `/api/auth/me`                  | ✓    | Current admin info                 |
| GET    | `/api/files/cv`                 | –    | Get current CV metadata            |
| GET    | `/api/files/cv/download`        | –    | Download the current CV            |
| POST   | `/api/files/cv`                 | ✓    | Upload / replace the CV            |
| DELETE | `/api/files/cv`                 | ✓    | Delete the current CV              |
| GET    | `/api/files/certs`              | –    | List all certifications            |
| GET    | `/api/files/certs/:id/download` | –    | Download a specific certification  |
| POST   | `/api/files/certs`              | ✓    | Upload a new certification         |
| DELETE | `/api/files/certs/:id`          | ✓    | Delete a certification             |

## Deployment

For production, deploy to a Node.js host like **Render**, **Railway**, **Fly.io**,
or a VPS. Make sure to:

1. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `JWT_SECRET` as environment variables on the host
2. Use HTTPS (most hosts provide this automatically)
3. Add persistent storage for `server/uploads/` and `server/data/`
   (or upgrade to cloud storage like S3 / R2 / Firebase Storage)

## License

MIT
