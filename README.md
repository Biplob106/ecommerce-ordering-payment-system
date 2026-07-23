# E-commerce Ordering & Payment System

Backend system for managing users, products, orders and payments with support
for multiple payment providers (Stripe, bKash).

> Work in progress — built as a technical assessment.

## Stack

| Layer | Technology |
|---|---|
| API | Node.js, Express 5, TypeScript |
| Database | PostgreSQL (via Prisma ORM) |
| Cache | Redis |
| Auth | JWT (access + refresh tokens), bcrypt |
| Payments | Stripe SDK, bKash Tokenized Checkout |
| Testing | Vitest, Supertest |
| Frontend | Next.js (deployed on Vercel) |
| Infra | Docker Compose, ngrok (webhook tunnelling) |

## Repository layout

```
.
├── backend/     Express + TypeScript API
├── frontend/    Next.js storefront
└── docs/        Architecture diagram, ERD, payment flow diagrams, Postman collection
```

## Getting started (backend)

```bash
cd backend
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

The API starts on `http://localhost:4000`. Verify with:

```bash
curl http://localhost:4000/health
```

## Environment configuration

All configuration lives in `backend/.env`. Copy `backend/.env.example` and fill
it in — every key is documented inline in that file.

`.env` is gitignored and must never be committed.

## Documentation

Diagrams, ERD and API documentation are in [`docs/`](./docs) — added as the
corresponding features land.

## License

Not licensed for reuse. Submitted as an assessment deliverable.
