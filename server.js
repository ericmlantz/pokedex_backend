"use strict";

const { Pool } = require("pg");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.SERVER_PORT || 5000;

// PostgreSQL configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Use this for RDS with SSL enabled
  },
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const allowedOrigins = ["https://pokedex.ericlan.tz", "http://localhost:3000"];
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});

// Routes

// Fetch all Pokémon
app.get("/pokemon", async (req, res) => {
  const query = `
    SELECT DISTINCT
      p.id,
      p.name,
      s.name AS species,
      array_agg(DISTINCT jsonb_build_object('id', m.id, 'name', m.name)) AS moves,
      array_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS type,
      pb.hp, 
      pb.attack, 
      pb.defense, 
      pb.special_attack, 
      pb.special_defense, 
      pb.speed
    FROM pokemon p
    JOIN pokemon_moves pm ON p.id = pm.pokemon_id
    JOIN moves m ON pm.move_id = m.id
    JOIN pokemon_types pt ON p.id = pt.pokemon_id
    JOIN types t ON t.id = pt.type_id
    JOIN pokemon_base_stats pb ON p.id = pb.pokemon_id
    JOIN species s ON s.id = p.species_id
    GROUP BY p.id, s.name, p.name, pb.hp, pb.attack, pb.defense, pb.special_attack, pb.special_defense, pb.speed
    ORDER BY p.id;
  `;
  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching Pokémon:", err);
    res.status(500).send({ error: "Internal server error" });
  }
});

// Fetch Pokémon by ID
app.get("/pokemon/:id", async (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT DISTINCT
      p.id,
      p.name,
      s.name AS species,
      array_agg(DISTINCT jsonb_build_object('id', m.id, 'name', m.name)) AS moves,
      array_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS type,
      pb.hp, 
      pb.attack, 
      pb.defense, 
      pb.special_attack, 
      pb.special_defense, 
      pb.speed
    FROM pokemon p
    JOIN pokemon_moves pm ON p.id = pm.pokemon_id
    JOIN moves m ON pm.move_id = m.id
    JOIN pokemon_types pt ON p.id = pt.pokemon_id
    JOIN types t ON t.id = pt.type_id
    JOIN pokemon_base_stats pb ON p.id = pb.pokemon_id
    JOIN species s ON s.id = p.species_id
    WHERE p.id = $1
    GROUP BY p.id, s.name, p.name, pb.hp, pb.attack, pb.defense, pb.special_attack, pb.special_defense, pb.speed
    ORDER BY p.id;
  `;
  try {
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(`Error fetching Pokémon with ID ${id}:`, err);
    res.status(500).send({ error: "Internal server error" });
  }
});

// Fetch all types
app.get("/types", async (req, res) => {
  const query = "SELECT id, name, color FROM types";
  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching types:", err);
    res.status(500).send({ error: "Internal server error" });
  }
});

// Fetch type details by ID
app.get("/types/:id", async (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT t.name, te.attacking_type_id, te.defending_type_id, te.effectiveness
    FROM types t
    JOIN type_effectiveness te
      ON t.id = te.attacking_type_id
      OR t.id = te.defending_type_id
    WHERE t.id = $1;
  `;
  try {
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(`Error fetching type with ID ${id}:`, err);
    res.status(500).send({ error: "Internal server error" });
  }
});

// Add a new Pokémon
app.post("/pokemon", async (req, res) => {
  const { pokemon_name, height, weight, species_id, stats, moves, type } =
    req.body;

  try {
    await pool.query("BEGIN");

    // Insert Pokémon
    const pokemonQuery = `
      INSERT INTO pokemon (name, height, weight, species_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `;
    const pokemonResult = await pool.query(pokemonQuery, [
      pokemon_name,
      height,
      weight,
      species_id,
    ]);
    const pokemonId = pokemonResult.rows[0].id;

    // Insert base stats
    const statsQuery = `
      INSERT INTO pokemon_base_stats (pokemon_id, hp, attack, defense, special_attack, special_defense, speed)
      VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;
    await pool.query(statsQuery, [
      pokemonId,
      stats.hp,
      stats.attack,
      stats.defense,
      stats.special_attack,
      stats.special_defense,
      stats.speed,
    ]);

    // Insert moves
    const moveQueries = moves.map((moveId) =>
      pool.query(
        "INSERT INTO pokemon_moves (pokemon_id, move_id) VALUES ($1, $2);",
        [pokemonId, moveId]
      )
    );
    await Promise.all(moveQueries);

    // Insert types
    const typeQueries = type.map((typeId) =>
      pool.query(
        "INSERT INTO pokemon_types (pokemon_id, type_id) VALUES ($1, $2);",
        [pokemonId, typeId]
      )
    );
    await Promise.all(typeQueries);

    await pool.query("COMMIT");

    res.json({ message: "Pokémon added successfully!" });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("Error adding Pokémon:", err);
    res.status(500).send({ error: "Internal server error" });
  }
});

// Delete Pokémon by ID
app.delete("/pokemon/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("BEGIN");

    await pool.query("DELETE FROM pokemon_moves WHERE pokemon_id = $1", [id]);
    await pool.query("DELETE FROM pokemon_types WHERE pokemon_id = $1", [id]);
    await pool.query("DELETE FROM pokemon_base_stats WHERE pokemon_id = $1", [
      id,
    ]);
    await pool.query("DELETE FROM pokemon WHERE id = $1", [id]);

    await pool.query("COMMIT");

    res.json({ message: "Pokémon deleted successfully!" });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(`Error deleting Pokémon with ID ${id}:`, err);
    res.status(500).send({ error: "Internal server error" });
  }
});

module.exports = app;