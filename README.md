# RecipeHub Backend (Express.js + MongoDB)

## Tech Stack

- **Runtime**: Node.js + Express
- **Database**: MongoDB Atlas (Native Driver)
- **Payments**: Stripe
- **Authentication**: Better Auth (JWT planned)
- **CORS**: Configured for frontend

## Main Collections

- `users`
- `recipes`
- `likes`
- `favorites`
- `reports`
- `payments`

## Key Features

- Recipe CRUD with ownership validation
- Premium membership system (lifetime)
- Recipe purchase via Stripe
- Admin panel (Manage Users, Recipes, Reports)
- Like / Favorite / Report system
- Featured recipes system

## Important Routes

### Public
- `GET /recipes` (with pagination & category filter)
- `GET /recipes/featured`
- `GET /recipes/popular`
- `GET /recipes/:id`

### Auth Protected
- `POST /recipes` (with 2-recipe limit for free users)
- `POST /recipes/:id/like`
- `POST /recipes/:id/favorite`
- `POST /recipes/:id/report`

### Premium & Payments
- `POST /payments/create-premium-checkout`
- `GET /payments/verify-premium`
- `POST /payments/create-recipe-checkout`
- `GET /payments/verify-recipe`

### Admin Routes
- `GET /admin/users`
- `PATCH /admin/users/:id/block`
- `GET /admin/recipes`
- `PATCH /admin/recipes/:id/feature`
- `DELETE /admin/recipes/:id`

## Environment Variables (.env)

```env
PORT=
MONGODB_URI=
CLIENT_URL=
STRIPE_SECRET_KEY=
STRIPE_PREMIUM_PRICE_CENTS=