
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

// 'use strict'

// const { Pool } = require('pg')
// const express = require('express')
// const cors = require('cors')
// require('dotenv').config()

// const app = express()
// const PORT = process.env.SERVER_PORT || 5000

// // PostgreSQL pool configuration
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: {
//     rejectUnauthorized: false
//   }
// })

// // Middleware
// app.use(express.static('public'))
// app.use(express.json())
// app.use(express.urlencoded({ extended: true }))

// // CORS
// const allowedOrigins = ['https://pokedex.ericlan.tz', 'http://localhost:3000']
// app.use(
//   cors({
//     origin: allowedOrigins,
//     credentials: true
//   })
// )

// // Start server
// app.listen(PORT, () => {
//   console.log('Server listening on port: ' + PORT)
// })

// // ---------- Utility Functions ----------
// const executeQuery = async (query, values = []) => {
//   const client = await pool.connect()
//   try {
//     const result = await client.query(query, values)
//     return result.rows
//   } finally {
//     client.release()
//   }
// }

// // ---------- Pokémon Routes ----------

// // Fetch all Pokémon
// app.get('/pokemon', async (req, res) => {
//   const query = `
//     SELECT DISTINCT
//       p.id, p.name, s.name AS species,
//       array_agg(DISTINCT jsonb_build_object('id', m.id, 'name', m.name)) AS moves,
//       array_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS type,
//       pb.hp, pb.attack, pb.defense, pb.special_attack, pb.special_defense, pb.speed
//     FROM pokemon p
//     JOIN species s ON s.id = p.species_id
//     JOIN pokemon_moves pm ON p.id = pm.pokemon_id
//     JOIN moves m ON pm.move_id = m.id
//     JOIN pokemon_types pt ON p.id = pt.pokemon_id
//     JOIN types t ON pt.type_id = t.id
//     JOIN pokemon_base_stats pb ON pb.pokemon_id = p.id
//     GROUP BY p.id, s.name, pb.hp, pb.attack, pb.defense, pb.special_attack, pb.special_defense, pb.speed
//     ORDER BY p.id;
//   `
//   try {
//     const rows = await executeQuery(query)
//     res.json(rows)
//   } catch (err) {
//     console.error('Error fetching Pokémon:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Fetch Pokémon by ID
// app.get('/pokemon/:id', async (req, res) => {
//   const { id } = req.params
//   const query = `
//     SELECT DISTINCT
//       p.id, p.name, s.name AS species,
//       array_agg(DISTINCT jsonb_build_object('id', m.id, 'name', m.name)) AS moves,
//       array_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS type,
//       pb.hp, pb.attack, pb.defense, pb.special_attack, pb.special_defense, pb.speed
//     FROM pokemon p
//     JOIN species s ON s.id = p.species_id
//     JOIN pokemon_moves pm ON p.id = pm.pokemon_id
//     JOIN moves m ON pm.move_id = m.id
//     JOIN pokemon_types pt ON p.id = pt.pokemon_id
//     JOIN types t ON pt.type_id = t.id
//     JOIN pokemon_base_stats pb ON pb.pokemon_id = p.id
//     WHERE p.id = $1
//     GROUP BY p.id, s.name, pb.hp, pb.attack, pb.defense, pb.special_attack, pb.special_defense, pb.speed
//     ORDER BY p.id;
//   `
//   try {
//     const rows = await executeQuery(query, [id])
//     if (rows.length === 0) {
//       return res.status(404).json({ error: 'Pokémon not found' })
//     }
//     res.json(rows[0])
//   } catch (err) {
//     console.error(`Error fetching Pokémon with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Add a new Pokémon
// app.post('/pokemon', async (req, res) => {
//   const pokemon = req.body.pokemons[0]
//   const stats = pokemon.stats
//   const moves = pokemon.moves
//   const types = pokemon.type

//   try {
//     const client = await pool.connect()
//     await client.query('BEGIN')

//     const insertPokemonQuery = `
//       INSERT INTO pokemon (name, height, weight, species_id)
//       VALUES ($1, $2, $3, $4)
//       RETURNING id;
//     `
//     const pokemonResult = await client.query(insertPokemonQuery, [
//       pokemon.name,
//       pokemon.height,
//       pokemon.weight,
//       pokemon.species_id
//     ])
//     const pokemonId = pokemonResult.rows[0].id

//     const insertStatsQuery = `
//       INSERT INTO pokemon_base_stats (pokemon_id, hp, attack, defense, special_attack, special_defense, speed)
//       VALUES ($1, $2, $3, $4, $5, $6, $7);
//     `
//     await client.query(insertStatsQuery, [
//       pokemonId,
//       stats.hp,
//       stats.attack,
//       stats.defense,
//       stats.special_attack,
//       stats.special_defense,
//       stats.speed
//     ])

//     for (const moveId of moves) {
//       await client.query(
//         'INSERT INTO pokemon_moves (pokemon_id, move_id) VALUES ($1, $2);',
//         [pokemonId, moveId]
//       )
//     }

//     for (const typeId of types) {
//       await client.query(
//         'INSERT INTO pokemon_types (pokemon_id, type_id) VALUES ($1, $2);',
//         [pokemonId, typeId]
//       )
//     }

//     await client.query('COMMIT')
//     res.status(201).json({ message: 'Pokemon added successfully!' })
//   } catch (err) {
//     await client.query('ROLLBACK')
//     console.error('Error adding Pokémon:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   } finally {
//     pool.release()
//   }
// })

// // Update Pokémon
// app.put('/pokemon/:id', async (req, res) => {
//   const { id } = req.params
//   const { name, species_id, moves, type, height, weight, stats } = req.body

//   try {
//     await pool.query('BEGIN')

//     const updatePokemonQuery = `
//       UPDATE pokemon
//       SET name = $1, species_id = $2, height = $3, weight = $4
//       WHERE id = $5;
//     `
//     await pool.query(updatePokemonQuery, [name, species_id, height, weight, id])

//     if (moves) {
//       await pool.query('DELETE FROM pokemon_moves WHERE pokemon_id = $1;', [id])
//       for (const moveId of moves) {
//         await pool.query(
//           'INSERT INTO pokemon_moves (pokemon_id, move_id) VALUES ($1, $2);',
//           [id, moveId]
//         )
//       }
//     }

//     if (type) {
//       await pool.query('DELETE FROM pokemon_types WHERE pokemon_id = $1;', [id])
//       for (const typeId of type) {
//         await pool.query(
//           'INSERT INTO pokemon_types (pokemon_id, type_id) VALUES ($1, $2);',
//           [id, typeId]
//         )
//       }
//     }

//     if (stats) {
//       const updateStatsQuery = `
//         UPDATE pokemon_base_stats
//         SET hp = $1, attack = $2, defense = $3, special_attack = $4, special_defense = $5, speed = $6
//         WHERE pokemon_id = $7;
//       `
//       await pool.query(updateStatsQuery, [
//         stats.hp,
//         stats.attack,
//         stats.defense,
//         stats.special_attack,
//         stats.special_defense,
//         stats.speed,
//         id
//       ])
//     }

//     await pool.query('COMMIT')
//     res.status(200).json({ message: 'Pokémon updated successfully!' })
//   } catch (err) {
//     await pool.query('ROLLBACK')
//     console.error('Error updating Pokémon:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Delete Pokémon by ID
// app.delete('/pokemon/:id', async (req, res) => {
//   const { id } = req.params
//   try {
//     await pool.query('BEGIN')
//     await pool.query('DELETE FROM pokemon_moves WHERE pokemon_id = $1;', [id])
//     await pool.query('DELETE FROM pokemon_types WHERE pokemon_id = $1;', [id])
//     await pool.query('DELETE FROM pokemon_base_stats WHERE pokemon_id = $1;', [
//       id
//     ])
//     await pool.query('DELETE FROM pokemon WHERE id = $1;', [id])
//     await pool.query('COMMIT')
//     res.status(200).json({ message: 'Pokemon deleted successfully!' })
//   } catch (err) {
//     await pool.query('ROLLBACK')
//     console.error('Error deleting Pokémon:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // ---------- Types Routes ----------

// // Fetch all types
// app.get('/types', async (req, res) => {
//   const query = 'SELECT id, name, color FROM types ORDER BY id;'
//   try {
//     const rows = await executeQuery(query)
//     res.json(rows)
//   } catch (err) {
//     console.error('Error fetching types:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Fetch type details by ID
// app.get('/types/:id', async (req, res) => {
//   const { id } = req.params
//   const query = `
//       SELECT 
//         t.id, 
//         t.name, 
//         t.color, 
//         json_agg(jsonb_build_object(
//           'attacking_type_id', te.attacking_type_id, 
//           'defending_type_id', te.defending_type_id, 
//           'effectiveness', te.effectiveness
//         )) AS effectiveness
//       FROM types t
//       LEFT JOIN type_effectiveness te
//         ON t.id = te.attacking_type_id
//       WHERE t.id = $1
//       GROUP BY t.id, t.name, t.color;
//     `
//   try {
//     const rows = await executeQuery(query, [id])
//     if (rows.length === 0) {
//       res.status(404).json({ error: 'Type not found' })
//     } else {
//       res.json(rows[0])
//     }
//   } catch (err) {
//     console.error(`Error fetching type with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Add a new type
// app.post('/types', async (req, res) => {
//   const { name, color } = req.body
//   const query = `
//       INSERT INTO types (name, color)
//       VALUES ($1, $2)
//       RETURNING id;
//     `
//   try {
//     const rows = await executeQuery(query, [name, color])
//     res
//       .status(201)
//       .json({ message: 'Type added successfully!', id: rows[0].id })
//   } catch (err) {
//     console.error('Error adding type:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Update type
// app.put('/types/:id', async (req, res) => {
//   const { id } = req.params
//   const { name, color } = req.body
//   const query = `
//       UPDATE types
//       SET name = $1, color = $2
//       WHERE id = $3;
//     `
//   try {
//     await executeQuery(query, [name, color, id])
//     res.status(200).json({ message: 'Type updated successfully!' })
//   } catch (err) {
//     console.error(`Error updating type with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Delete type
// app.delete('/types/:id', async (req, res) => {
//   const { id } = req.params
//   const query = 'DELETE FROM types WHERE id = $1;'
//   try {
//     await executeQuery(query, [id])
//     res.status(200).json({ message: 'Type deleted successfully!' })
//   } catch (err) {
//     console.error(`Error deleting type with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Fetch all Pokémon by a specific type
// app.get('/pokemon/types/:type', async (req, res) => {
//   const { type } = req.params
//   const query = `
//       SELECT 
//         p.id, 
//         p.name, 
//         s.name AS species,
//         array_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS types,
//         pb.hp, 
//         pb.attack, 
//         pb.defense, 
//         pb.special_attack, 
//         pb.special_defense, 
//         pb.speed
//       FROM pokemon p
//       JOIN species s ON s.id = p.species_id
//       JOIN pokemon_types pt ON p.id = pt.pokemon_id
//       JOIN types t ON pt.type_id = t.id
//       JOIN pokemon_base_stats pb ON pb.pokemon_id = p.id
//       WHERE LOWER(t.name) = LOWER($1)
//       GROUP BY p.id, s.name, pb.hp, pb.attack, pb.defense, pb.special_attack, pb.special_defense, pb.speed
//       ORDER BY p.id;
//     `
//   try {
//     const rows = await executeQuery(query, [type])
//     if (rows.length === 0) {
//       res.status(404).json({ error: `No Pokémon found with type: ${type}` })
//     } else {
//       res.json(rows)
//     }
//   } catch (err) {
//     console.error(`Error fetching Pokémon by type (${type}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // ---------- Moves Routes ----------

// // Fetch all moves
// app.get('/moves', async (req, res) => {
//   const query = 'SELECT id, name FROM moves ORDER BY id;'
//   try {
//     const rows = await executeQuery(query)
//     res.json(rows)
//   } catch (err) {
//     console.error('Error fetching moves:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Fetch move details by ID
// app.get('/moves/:id', async (req, res) => {
//   const { id } = req.params
//   const query = `
//       SELECT 
//         m.id, 
//         m.name AS move_name, 
//         t.name AS type_name, 
//         m.power, 
//         m.accuracy, 
//         m.power_point
//       FROM moves m
//       JOIN types t ON m.types_id = t.id
//       WHERE m.id = $1;
//     `
//   try {
//     const rows = await executeQuery(query, [id])
//     if (rows.length === 0) {
//       res.status(404).json({ error: 'Move not found' })
//     } else {
//       res.json(rows[0])
//     }
//   } catch (err) {
//     console.error(`Error fetching move with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Add a new move
// app.post('/moves', async (req, res) => {
//   const { name, types_id, power, accuracy, power_point } = req.body
//   const query = `
//       INSERT INTO moves (name, types_id, power, accuracy, power_point)
//       VALUES ($1, $2, $3, $4, $5)
//       RETURNING id;
//     `
//   try {
//     const rows = await executeQuery(query, [
//       name,
//       types_id,
//       power,
//       accuracy,
//       power_point
//     ])
//     res
//       .status(201)
//       .json({ message: 'Move added successfully!', id: rows[0].id })
//   } catch (err) {
//     console.error('Error adding move:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Update a move
// app.put('/moves/:id', async (req, res) => {
//   const { id } = req.params
//   const { name, types_id, power, accuracy, power_point } = req.body
//   const query = `
//       UPDATE moves
//       SET name = $1, types_id = $2, power = $3, accuracy = $4, power_point = $5
//       WHERE id = $6;
//     `
//   try {
//     await executeQuery(query, [
//       name,
//       types_id,
//       power,
//       accuracy,
//       power_point,
//       id
//     ])
//     res.status(200).json({ message: 'Move updated successfully!' })
//   } catch (err) {
//     console.error(`Error updating move with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Delete a move
// app.delete('/moves/:id', async (req, res) => {
//   const { id } = req.params
//   const query = 'DELETE FROM moves WHERE id = $1;'
//   try {
//     await executeQuery(query, [id])
//     res.status(200).json({ message: 'Move deleted successfully!' })
//   } catch (err) {
//     console.error(`Error deleting move with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Fetch all Pokémon by a specific move
// app.get('/pokemon/moves/:move', async (req, res) => {
//   const { move } = req.params
//   const query = `
//       SELECT 
//         p.id, 
//         p.name, 
//         s.name AS species,
//         array_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS types,
//         pb.hp, 
//         pb.attack, 
//         pb.defense, 
//         pb.special_attack, 
//         pb.special_defense, 
//         pb.speed
//       FROM pokemon p
//       JOIN species s ON s.id = p.species_id
//       JOIN pokemon_moves pm ON p.id = pm.pokemon_id
//       JOIN moves m ON pm.move_id = m.id
//       JOIN pokemon_types pt ON p.id = pt.pokemon_id
//       JOIN types t ON pt.type_id = t.id
//       JOIN pokemon_base_stats pb ON pb.pokemon_id = p.id
//       WHERE LOWER(m.name) = LOWER($1)
//       GROUP BY p.id, s.name, pb.hp, pb.attack, pb.defense, pb.special_attack, pb.special_defense, pb.speed
//       ORDER BY p.id;
//     `
//   try {
//     const rows = await executeQuery(query, [move])
//     if (rows.length === 0) {
//       res.status(404).json({ error: `No Pokémon found with move: ${move}` })
//     } else {
//       res.json(rows)
//     }
//   } catch (err) {
//     console.error(`Error fetching Pokémon by move (${move}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // ---------- Species Routes ----------

// // Fetch all species
// app.get('/species', async (req, res) => {
//   const query = 'SELECT id, name FROM species ORDER BY id;'
//   try {
//     const rows = await executeQuery(query)
//     res.json(rows)
//   } catch (err) {
//     console.error('Error fetching species:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Fetch species by ID
// app.get('/species/:id', async (req, res) => {
//   const { id } = req.params
//   const query = 'SELECT id, name FROM species WHERE id = $1;'
//   try {
//     const rows = await executeQuery(query, [id])
//     if (rows.length === 0) {
//       res.status(404).json({ error: 'Species not found' })
//     } else {
//       res.json(rows[0])
//     }
//   } catch (err) {
//     console.error(`Error fetching species with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Add a new species
// app.post('/pokemon/species', async (req, res) => {
//   const { species_name } = req.body

//   if (!species_name) {
//     return res.status(400).json({ error: 'Species name is required.' })
//   }

//   const query = `
//       INSERT INTO species (name)
//       VALUES ($1)
//       RETURNING id;
//     `

//   try {
//     const rows = await executeQuery(query, [species_name])
//     res
//       .status(201)
//       .json({ message: 'Species added successfully!', id: rows[0].id })
//   } catch (err) {
//     console.error('Error adding species:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Update species
// app.put('/species/:id', async (req, res) => {
//   const { id } = req.params
//   const { name } = req.body
//   const query = 'UPDATE species SET name = $1 WHERE id = $2;'
//   try {
//     await executeQuery(query, [name, id])
//     res.status(200).json({ message: 'Species updated successfully!' })
//   } catch (err) {
//     console.error(`Error updating species with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Delete species
// app.delete('/species/:id', async (req, res) => {
//   const { id } = req.params
//   const query = 'DELETE FROM species WHERE id = $1;'
//   try {
//     await executeQuery(query, [id])
//     res.status(200).json({ message: 'Species deleted successfully!' })
//   } catch (err) {
//     console.error(`Error deleting species with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // ---------- Natures Routes ----------

// // Fetch all Natures
// app.get('/natures', async (req, res) => {
//   const query =
//     'SELECT id, name, increased_stat, decreased_stat, description FROM natures ORDER BY id;'
//   try {
//     const rows = await executeQuery(query)
//     res.json(rows)
//   } catch (err) {
//     console.error('Error fetching natures:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Fetch nature by ID
// app.get('/natures/:id', async (req, res) => {
//   const { id } = req.params
//   const query = `
//       SELECT id, name, increased_stat, decreased_stat, description 
//       FROM natures 
//       WHERE id = $1;
//     `
//   try {
//     const rows = await executeQuery(query, [id])
//     if (rows.length === 0) {
//       return res.status(404).json({ error: 'Nature not found' })
//     }
//     res.json(rows[0])
//   } catch (err) {
//     console.error(`Error fetching nature with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Add a new nature
// app.post('/natures', async (req, res) => {
//   const { name, increased_stat, decreased_stat, description } = req.body
//   const query = `
//       INSERT INTO natures (name, increased_stat, decreased_stat, description)
//       VALUES ($1, $2, $3, $4)
//       RETURNING id;
//     `
//   try {
//     const rows = await executeQuery(query, [
//       name,
//       increased_stat,
//       decreased_stat,
//       description
//     ])
//     res
//       .status(201)
//       .json({ message: 'Nature added successfully!', id: rows[0].id })
//   } catch (err) {
//     console.error('Error adding nature:', err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Update a nature
// app.put('/natures/:id', async (req, res) => {
//   const { id } = req.params
//   const { name, increased_stat, decreased_stat, description } = req.body
//   const query = `
//       UPDATE natures
//       SET name = $1, increased_stat = $2, decreased_stat = $3, description = $4
//       WHERE id = $5;
//     `
//   try {
//     await executeQuery(query, [
//       name,
//       increased_stat,
//       decreased_stat,
//       description,
//       id
//     ])
//     res.status(200).json({ message: 'Nature updated successfully!' })
//   } catch (err) {
//     console.error(`Error updating nature with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// // Delete a nature
// app.delete('/natures/:id', async (req, res) => {
//   const { id } = req.params
//   const query = 'DELETE FROM natures WHERE id = $1;'
//   try {
//     await executeQuery(query, [id])
//     res.status(200).json({ message: 'Nature deleted successfully!' })
//   } catch (err) {
//     console.error(`Error deleting nature with ID (${id}):`, err)
//     res.status(500).json({ error: 'Internal server error' })
//   }
// })

// module.exports = app