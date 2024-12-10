'use strict'

const { Pool } = require('pg')
const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const PORT = process.env.SERVER_PORT || 5000

// PostgreSQL configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Use this for RDS with SSL enabled
  }
})

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

const allowedOrigins = ['https://pokedex.ericlan.tz', 'http://localhost:3000']
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
)

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`)
})

// Routes

// ---------- Pokémon Routes ----------

// Fetch all Pokémon
app.get('/pokemon', async (req, res) => {
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
  `
  try {
    const result = await pool.query(query)
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching Pokémon:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Fetch Pokémon by ID
app.get('/pokemon/:id', async (req, res) => {
  const { id } = req.params
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
  `
  try {
    const result = await pool.query(query, [id])
    res.json(result.rows)
  } catch (err) {
    console.error(`Error fetching Pokémon with ID ${id}:`, err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Add a new Pokémon
app.post('/pokemon', async (req, res) => {
  try {
    const pokemon = req.body['pokemons'][0]
    const stats = pokemon['stats']
    const moves = pokemon['moves']
    const types = pokemon['type']

    await pool.query('BEGIN') // Start a transaction

    // Insert details into the Pokémon table and return the new row
    const pokemonQuery = `
      INSERT INTO POKEMON (name, height, weight, species_id)
      VALUES ($1::text, $2::integer, $3::integer, $4::integer)
      RETURNING *;
    `
    const pokemonResult = await pool.query(pokemonQuery, [
      pokemon['name'],
      parseInt(pokemon['height']),
      parseInt(pokemon['weight']),
      parseInt(pokemon['species_id'])
    ])

    const pokemonRow = pokemonResult.rows[0] // Recently inserted Pokémon

    // Insert details into the Pokémon base stats table
    const baseStatsQuery = `
      INSERT INTO POKEMON_BASE_STATS (pokemon_id, hp, attack, defense, special_attack, special_defense, speed)
      VALUES ($1::smallint, $2::smallint, $3::smallint, $4::smallint, $5::smallint, $6::smallint, $7::smallint);
    `
    await pool.query(baseStatsQuery, [
      pokemonRow.id,
      stats['hp'],
      stats['attack'],
      stats['defense'],
      stats['special_attack'],
      stats['special_defense'],
      stats['speed']
    ])

    // Insert details into the Pokémon moves table
    const moveQueries = moves.map((id) =>
      pool.query(
        'INSERT INTO POKEMON_MOVES (pokemon_id, move_id) VALUES ($1::integer, $2::integer);',
        [pokemonRow.id, id]
      )
    )
    await Promise.all(moveQueries)

    // Insert details into the Pokémon types table
    const typeQueries = types.map((id) =>
      pool.query(
        'INSERT INTO POKEMON_TYPES (pokemon_id, type_id) VALUES ($1::integer, $2::integer);',
        [pokemonRow.id, id]
      )
    )
    await Promise.all(typeQueries)

    await pool.query('COMMIT') // Commit the transaction
    res.status(201).json({ message: 'Pokemon added successfully!' })
  } catch (error) {
    await pool.query('ROLLBACK') // Rollback the transaction in case of an error
    console.error('Error adding Pokémon:', error)
    res
      .status(400)
      .json({ error: 'Error - Details provided in incorrect format' })
  }
})

// Update Pokémon
app.put('/pokemon', async (req, res) => {
  const { id, name, species_id, moves, type, height, weight, stats } = req.body
  if (!id) return res.status(400).send({ error: 'ID is required' })

  try {
    await pool.query('BEGIN')

    // Update Pokémon details
    const pokemonQuery = `
      UPDATE pokemon
      SET name = $1, species_id = $2, height = $3, weight = $4
      WHERE id = $5;
    `
    await pool.query(pokemonQuery, [name, species_id, height, weight, id])

    // Update moves
    if (moves) {
      await pool.query('DELETE FROM pokemon_moves WHERE pokemon_id = $1;', [id])
      const moveQueries = moves.map((moveId) =>
        pool.query(
          'INSERT INTO pokemon_moves (pokemon_id, move_id) VALUES ($1, $2);',
          [id, moveId]
        )
      )
      await Promise.all(moveQueries)
    }

    // Update types
    if (type) {
      await pool.query('DELETE FROM pokemon_types WHERE pokemon_id = $1;', [id])
      const typeQueries = type.map((typeId) =>
        pool.query(
          'INSERT INTO pokemon_types (pokemon_id, type_id) VALUES ($1, $2);',
          [id, typeId]
        )
      )
      await Promise.all(typeQueries)
    }

    // Update stats
    if (stats) {
      const statsQuery = `
        UPDATE pokemon_base_stats
        SET hp = $1, attack = $2, defense = $3, special_attack = $4, special_defense = $5, speed = $6
        WHERE pokemon_id = $7;
      `
      await pool.query(statsQuery, [
        stats.hp,
        stats.attack,
        stats.defense,
        stats.special_attack,
        stats.special_defense,
        stats.speed,
        id
      ])
    }

    await pool.query('COMMIT')
    res.status(200).send({ message: 'Pokémon updated successfully!' })
  } catch (err) {
    await pool.query('ROLLBACK')
    console.error('Error updating Pokémon:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Delete Pokémon
app.delete('/pokemon/:id', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query('BEGIN')
    await pool.query('DELETE FROM pokemon_moves WHERE pokemon_id = $1;', [id])
    await pool.query('DELETE FROM pokemon_types WHERE pokemon_id = $1;', [id])
    await pool.query('DELETE FROM pokemon_base_stats WHERE pokemon_id = $1;', [
      id
    ])
    await pool.query('DELETE FROM pokemon WHERE id = $1;', [id])
    await pool.query('COMMIT')
    res.status(200).send({ message: 'Pokémon deleted successfully!' })
  } catch (err) {
    await pool.query('ROLLBACK')
    console.error('Error deleting Pokémon:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// ---------- Moves Routes ----------

// Fetch all moves
app.get('/moves', async (req, res) => {
  const query = 'SELECT id, name FROM moves'
  try {
    const result = await pool.query(query)
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching moves:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Fetch move details by ID
app.get('/moves/:id', async (req, res) => {
  const { id } = req.params
  const query = `
    SELECT m.id, m.name AS move_name, t.name AS type_name, m.power, m.accuracy, m.power_point
    FROM moves m
    JOIN types t ON m.types_id = t.id
    WHERE m.id = $1;
  `
  try {
    const result = await pool.query(query, [id])
    res.json(result.rows)
  } catch (err) {
    console.error(`Error fetching move with ID ${id}:`, err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Add a new move
app.post('/moves', async (req, res) => {
  const { name, types_id, power, accuracy, power_point } = req.body
  const query = `
    INSERT INTO moves (name, types_id, power, accuracy, power_point)
    VALUES ($1, $2, $3, $4, $5);
  `
  try {
    await pool.query(query, [name, types_id, power, accuracy, power_point])
    res.status(201).send({ message: 'Move added successfully!' })
  } catch (err) {
    console.error('Error adding move:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Update move
app.put('/moves/:id', async (req, res) => {
  const { id } = req.params
  const { name, types_id, power, accuracy, power_point } = req.body
  const query = `
    UPDATE moves
    SET name = $1, types_id = $2, power = $3, accuracy = $4, power_point = $5
    WHERE id = $6;
  `
  try {
    await pool.query(query, [name, types_id, power, accuracy, power_point, id])
    res.status(200).send({ message: 'Move updated successfully!' })
  } catch (err) {
    console.error('Error updating move:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Delete move
app.delete('/moves/:id', async (req, res) => {
  const { id } = req.params
  const query = 'DELETE FROM moves WHERE id = $1;'
  try {
    await pool.query(query, [id])
    res.status(200).send({ message: 'Move deleted successfully!' })
  } catch (err) {
    console.error('Error deleting move:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// ---------- Types Routes ----------

// Fetch all types
app.get('/types', async (req, res) => {
  const query = 'SELECT id, name, color FROM types'
  try {
    const result = await pool.query(query)
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching types:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Fetch type details by ID
app.get('/types/:id', async (req, res) => {
  const { id } = req.params
  const query = `
    SELECT t.name, te.attacking_type_id, te.defending_type_id, te.effectiveness
    FROM types t
    JOIN type_effectiveness te
      ON t.id = te.attacking_type_id
      OR t.id = te.defending_type_id
    WHERE t.id = $1;
  `
  try {
    const result = await pool.query(query, [id])
    res.json(result.rows)
  } catch (err) {
    console.error(`Error fetching type with ID ${id}:`, err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Add a new type
app.post('/types', async (req, res) => {
  const { name, color } = req.body
  const query = `
    INSERT INTO types (name, color)
    VALUES ($1, $2);
  `
  try {
    await pool.query(query, [name, color])
    res.status(201).send({ message: 'Type added successfully!' })
  } catch (err) {
    console.error('Error adding type:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Update type
app.put('/types/:id', async (req, res) => {
  const { id } = req.params
  const { name, color } = req.body
  const query = `
    UPDATE types
    SET name = $1, color = $2
    WHERE id = $3;
  `
  try {
    await pool.query(query, [name, color, id])
    res.status(200).send({ message: 'Type updated successfully!' })
  } catch (err) {
    console.error('Error updating type:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Delete type
app.delete('/types/:id', async (req, res) => {
  const { id } = req.params
  const query = 'DELETE FROM types WHERE id = $1;'
  try {
    await pool.query(query, [id])
    res.status(200).send({ message: 'Type deleted successfully!' })
  } catch (err) {
    console.error('Error deleting type:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// ---------- Species Routes ----------

// Fetch all species
app.get('/species', async (req, res) => {
  const query = 'SELECT id, name FROM species ORDER BY id;'
  try {
    const result = await pool.query(query)
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching species:', err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

// Fetch species by ID
app.get('/species/:id', async (req, res) => {
  const { id } = req.params
  const query = 'SELECT id, name FROM species WHERE id = $1;'
  try {
    const result = await pool.query(query, [id])
    if (result.rows.length === 0) {
      res.status(404).send({ error: 'Species not found' })
    } else {
      res.json(result.rows[0])
    }
  } catch (err) {
    console.error(`Error fetching species with ID ${id}:`, err)
    res.status(500).send({ error: 'Internal server error' })
  }
})

module.exports = app
