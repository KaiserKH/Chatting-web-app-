# Chatting-web-app-

Pulse Chat is a full-stack personal chat application built with Node.js, Express, MySQL, Socket.IO, JWT authentication, bcrypt, multer, and a vanilla JavaScript frontend.

## What is included

- Authentication with access and refresh JWT tokens
- Friends, conversations, messages, reactions, read receipts, stories, notifications, and uploads
- Real-time updates through Socket.IO
- Local file uploads stored under `public/uploads`

## Requirements

- Node.js 18+ recommended
- MySQL 8+

## Step-by-step setup

1. Install MySQL and make sure the service is running.
2. Create or choose a database user with permission to create and modify the `chatapp` database.
3. Review the `.env` file in the project root.
4. Update `DB_USER` and `DB_PASSWORD` if your local MySQL credentials are different.
5. The JWT secrets are already generated for local development, but you can replace them anytime by editing `JWT_SECRET` and `JWT_REFRESH_SECRET`.
6. Install dependencies:
	```bash
	npm install
	```
7. Import the database schema:
	```bash
	mysql -u root -p < schema.sql
	```
	If your MySQL username is not `root`, replace it with your own user.
8. Start the app:
	```bash
	npm run dev
	```
	or
	```bash
	npm start
	```
9. Open the app in your browser:
	```
	http://localhost:3000
	```
10. Register a user, log in, then start chatting.

## Environment variables

The app uses these variables from `.env`:

- `PORT`
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `CLOUDINARY_URL` optional
- `CLIENT_URL`

## Notes

- File uploads are stored locally and served from `/uploads`.
- The schema file creates the database and all required tables.
- The frontend is a single-page vanilla JavaScript UI served from `public/`.
