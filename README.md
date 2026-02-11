# Vestoria Backend API

Backend API for Vestoria application deployed on Render.com.

## 🚀 Deployment

This backend is deployed on Render.com with PostgreSQL database on Railway.

### Environment Variables
- NODE_ENV=production
- PORT=4001
- DATABASE_URL (Railway PostgreSQL)
- JWT_SECRET, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
- SMTP configuration for email
- Admin credentials

### API Endpoints
- Health: `/api/health`
- Authentication: `/api/auth/*`
- Products: `/api/products/*`
- Orders: `/api/orders/*`
- Transactions: `/api/transactions/*`
- Withdrawals: `/api/withdrawals/*`

### Database
- PostgreSQL on Railway
- Prisma ORM
- Auto-migrations on deploy

### Features
- JWT authentication
- Role-based access control
- File uploads
- Email notifications
- Transaction processing
- VIP system
- Daily rewards
