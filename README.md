# Pokedex API

The goal of our team’s project is to build an interactive Pokédex website that provides a user-friendly experience for learning about various Pokémon.
This Pokémon API allows users to interact with a PostgreSQL database containing Pokémon data, including details about Pokémon, their moves, types, species, and natures. It also includes functionality for uploading files to AWS S3.

## Table of Contents

- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Technologies Used](#technologies-used)

## Setup Instructions

1. **Clone the repository**:

   ```bash
   git clone https://github.com/clivethe14/pokedex_backend.git
   cd pokedex_backend
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Configure environment variables**:

   - Create a `.env` file in the project root.
   - Add the required variables (see [Environment Variables](#environment-variables)).

4. **Run the server**:
   ```bash
   npm start
   ```
   The server will start on the specified port (default: `8000`).

## Environment Variables

| Variable          | Description                 |
| ----------------- | --------------------------- |
| `SERVER_PORT`     | Port for the Express server |
| `PG_USER`         | PostgreSQL username         |
| `PG_PASSWORD`     | PostgreSQL password         |
| `PG_HOST`         | PostgreSQL host             |
| `PG_PORT`         | PostgreSQL port             |
| `AWS_REGION`      | AWS S3 region               |
| `AWS_BUCKET_NAME` | Name of the AWS S3 bucket   |

## Technologies Used

- **Node.js**
- **Express**
- **PostgreSQL**
- **AWS S3**
- **Multer** for file uploads
- **dotenv** for managing environment variables
