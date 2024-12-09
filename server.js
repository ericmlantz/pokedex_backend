"use strict";;
const { Client } = require("pg");
const express = require("express");
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const s3 = new S3Client({ region: process.env.AWS_REGION });
const upload = multer({ dest: 'uploads/' });

const app = express();
app.use(express.static("public"));
const PORT = process.env.SERVER_PORT;

app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

app.listen(PORT, () => {
  console.log("Server listening on port: " + PORT);
});

const clientConfig = {
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  ssl: {
    rejectUnauthorized: false,
  },

};

const cors = require('cors');
const allowedOrigins = ['https://pokedex.ericlan.tz','localhost:3000']; // Your frontend origin

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // Allow cookies to be sent
  })
);

const client = new Client(clientConfig);
client.connect().then(() => {
    console.log("Connected to the database");
}).catch(err => {
    console.error("Database connection error", err);
});

const updateDatabase = async (query, values, res) => {
  try {
    const client = new Client(clientConfig);
    await client
      .connect()
    await client.query(query, values);
    res.status(200).send({ message: "Success" });
    await client.end();     //Close connection to database
  } catch (error) {
    console.error(error);
    res.status(300).send({ error: "Failed to execute query" });
  }
};

// List of all pokemons with all details
app.get("/pokemon", async function (req, res) {
  try {
    const client = new Client(clientConfig);
    await client.connect();
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
            FROM (pokemon p
            JOIN pokemon_moves pm ON p.id = pm.pokemon_id 
            JOIN moves m ON pm.move_id = m.id 
            JOIN pokemon_types pt ON p.id = pt.pokemon_id 
            JOIN types t ON t.id = pt.type_Id 
            JOIN pokemon_base_stats pb ON p.id = pb.pokemon_id
            JOIN species s ON s.id = p.species_id)
            GROUP BY 
                p.id,
                s.name,
                p.name,
                pb.hp, 
                pb.attack, 
                pb.defense, 
                pb.special_attack, 
                pb.special_defense, 
                pb.speed
            ORDER BY p.id;
        `;

    const result = await client.query(query);
    res.set("Content-Type", "application/json");
    res.send(result.rows);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});

// List of all details of that specific pokemon ID
app.get("/pokemon/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();

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
            FROM (pokemon p
            JOIN pokemon_moves pm ON p.id = pm.pokemon_id 
            JOIN moves m ON pm.move_id = m.id 
            JOIN pokemon_types pt ON p.id = pt.pokemon_id 
            JOIN types t ON t.id = pt.type_Id 
            JOIN pokemon_base_stats pb ON p.id = pb.pokemon_id
            JOIN species s ON s.id = p.species_id)
            WHERE p.id = $1
            GROUP BY 
                p.id,
                s.name,
                p.name,
                pb.hp, 
                pb.attack, 
                pb.defense, 
                pb.special_attack, 
                pb.special_defense, 
                pb.speed
            ORDER BY p.id;
        `;
    const result = await client.query(query, [id]);
    res.json(result.rows);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});

// List of all the species and the species ID
app.get("/species", async function (req, res) {
  try {
    const client = new Client(clientConfig);
    await client.connect();
    const result = await client.query("SELECT id,name FROM species");
    res.set("Content-Type", "application/json");
    res.send(result.rows);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});

// List of all details of that specific species ID
app.get("/species/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    const result = await client.query(
      "SELECT name,id FROM species WHERE id = $1",
      [id]
    );
    res.set("Content-Type", "application/json");
    res.send(result.rows);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});

// List of all moves in pokemon
app.get("/moves", async function (req, res) {
  try {
    const client = new Client(clientConfig);
    await client.connect();
    const result = await client.query("SELECT id, name FROM moves");

    const moves = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
    }));

    res.set("Content-Type", "application/json");
    res.send(moves);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});

// List of all details of that specific move ID
app.get("/moves/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    const result = await client.query(
      "SELECT m.id, m.name AS move_name, t.name AS type_name, m.power, m.accuracy, m.power_point FROM moves m JOIN types t ON m.types_Id = t.id WHERE m.id = $1",
      [id]
    );
    const move = result.rows.map((row) => ({
      id: row.id,
      moveName: row.move_name,
      typeName: row.type_name,
      power: row.power,
      accuracy: row.accuracy,
      powerPoint: row.power_point,
    }));
    res.set("Content-Type", "application/json");
    res.send(move);

    await client.end();     //Close connection to database

  } catch (e) {
    console.log(e);
    res.status(500).send({ error: e });
  }
});

//List of all pokemon name, ID, and image(maybe) of that specific TYPE
app.get("/pokemon/types/:type", async function (req, res) {
  try {
    const { type } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    const result = await client.query(
      `
          SELECT t.name, p.name
          FROM pokemon p
          JOIN pokemon_types pt ON pt.pokemon_id = p.id
          JOIN types t ON t.id = pt.type_Id
          WHERE t.name = $1
      `,
      [type]
    );
    res.set("Content-Type", "application/json");
    res.send(result.rows);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});

// List of all types in pokemon
app.get("/types", async function (req, res) {
  try {
    const client = new Client(clientConfig);
    await client.connect();
    const result = await client.query("SELECT id, name, color FROM TYPES");
    const types = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
    }));
    res.set("Content-Type", "application/json");
    res.send(types);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});
// List of all details of that specific type ID
app.get("/types/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    const result = await client.query(
      `
          SELECT t.name, te.attacking_type_id, te.defending_type_id, te.effectiveness
          FROM types t
          JOIN type_effectiveness te
              ON t.id = te.attacking_type_id
              OR t.id = te.defending_type_id
          WHERE t.id = $1
      `,
      [id]
    );

    const typeDetails = result.rows.map((row) => ({
      typeName: row.type_name,
      attackingTypeId: row.attacking_type_id,
      defendingTypeId: row.defending_type_id,
      effectiveness: row.effectiveness,
    }));
    res.set("Content-Type", "application/json");
    res.send(typeDetails);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});

// List of all natures in pokemon
app.get("/natures", async function (req, res) {
  try {
    const client = new Client(clientConfig);
    await client.connect();
    const result = await client.query("SELECT name FROM natures");
    res.set("Content-Type", "application/json");
    res.send(result.rows);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});

// List of all details of that specific nature ID
app.get("/natures/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    const result = await client.query(
      "SELECT id,name,increased_stat,decreased_stat,description FROM natures WHERE id = $1",
      [id]
    );
    res.set("Content-Type", "application/json");
    res.send(result.rows);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e });
  }
});

//Post and add a new pokemon
app.post("/pokemon", async (req, res) => {
  try {
    const pokemon = req.body["pokemons"][0];
    const stats = pokemon["stats"];
    const moves = pokemon["moves"];
    const types = pokemon["type"];

    const client = new Client(clientConfig);
    await client.connect();     //Connect to database

    //Query for inserting details into pokemon table and return the new row inserted
    const pokemon_query = await client.query(
      "INSERT INTO POKEMON(name,height,weight,species_id) VALUES ($1::text,$2::integer,$3::integer,$4::integer) RETURNING *;",
      [
        pokemon["pokemon_name"],
        parseInt(pokemon["height"]),
        parseInt(pokemon["weight"]),
        parseInt(pokemon["species_id"]),
      ]
    );

    let pokemon_row = pokemon_query["rows"][0]; //recently inserted row from pokemon table

    //Query for inserting details into pokemon_base_stats table
    const pokemon_base_stats_query = await client.query(
      "INSERT INTO POKEMON_BASE_STATS(pokemon_id,hp,attack,defense,special_attack,special_defense,speed) VALUES ($1::smallint,$2::smallint,$3::smallint,$4::smallint,$5::smallint,$6::smallint,$7::smallint);",
      [
        pokemon_row["id"],
        stats["hp"],
        stats["attack"],
        stats["defense"],
        stats["special_attack"],
        stats["special_defense"],
        stats["speed"],
      ]
    );

    //Queries for inserting details into pokemon_moves table
    await moves.forEach(async (id) => {
      let pokemon_moves_query = await client.query(
        "INSERT INTO POKEMON_MOVES(pokemon_id,move_id) VALUES ($1::integer,$2::integer);",
        [parseInt(pokemon_row["id"]), parseInt(id)]
      );
    });

    //Queries for inserting details into pokemon_types table
    for (const id of types) {
        await client.query(
            "INSERT INTO POKEMON_TYPES(pokemon_id,type_id) VALUES ($1::integer,$2::integer)",
            [pokemon_row["id"], id]
        );
    }

    res.set("Content-Type", "application/json");
    res.send({ message: "Pokemon added successfully!" });

    await client.end();     //Close connection to database

  } catch (ex) {

    res.status(300).send({ error: "ERROR - Details provided in incorrect format" });

  }
});

//Post and add a new species
app.post("/pokemon/species", async (req, res) => {
  try {

    const species = req.body;

    const client = new Client(clientConfig);
    await client.connect();     //Connect to database

    //Query for inserting details into species table
    const result = await client.query(
      "INSERT INTO SPECIES(name) VALUES ($1::text);",
      [species["species_name"]]
    );

    res.set("Content-Type", "application/json");
    res.send({ message: "Species added successfully!" });

    await client.end();     //Close connection to database

  } catch (ex) {

    res.status(300).send({ error: "ERROR - Details provided in incorrect format" });

  }
});

//Post and add a new move
app.post("/pokemon/moves", async (req, res) => {
  try {

    const moves = req.body;

    const client = new Client(clientConfig);
    await client.connect();     //Connect to database

    //Query for inserting details into moves table
    const result = await client.query(
      "INSERT INTO MOVES(name,types_id,power,accuracy,power_point) VALUES ($1::text,$2::integer,$3::integer,$4::integer,$5::smallint);",
      [
        moves["move_name"],
        moves["type_id"],
        moves["power"],
        moves["accuracy"],
        moves["pp"],
      ]
    );

    res.set("Content-Type", "application/json");
    res.send({ message: "Move added successfully!" });

    await client.end();     //Close connection to database

  } catch (ex) {

    res.status(300).send({ error: "ERROR - Details provided in incorrect format" });

  }
});

//Post and add a new type
app.post("/types", async (req, res) => {
  try {
    const type = req.body;
    const client = new Client(clientConfig);
    await client.connect(); //Connect to database

    //Query for inserting details into moves table
    const types_query = await client.query(
      "INSERT INTO TYPES(name,color) VALUES ($1::text,$2::text) RETURNING *;",
      [type["type_name"], type["color"]]
    );

    const type_id = types_query["rows"][0]["id"];
    const type_strengths = type["strengths"];

    //Queries for inserting details into type_effectiveness table for strengths
    type_strengths.forEach((id) => {
      const type_strength_query = client.query(
        "INSERT INTO TYPE_EFFECTIVENESS(attacking_type_id, defending_type_id, effectiveness) VALUES($1::integer, $2::integer, 2.0);",
        [type_id, id]
      );
    });

    const type_weaknesses = type["weaknesses"];

    //Queries for inserting details into type_effectiveness table for weaknesses
    type_weaknesses.forEach((id) => {
      const type_strength_query = client.query(
        "INSERT INTO TYPE_EFFECTIVENESS(attacking_type_id, defending_type_id, effectiveness) VALUES($1::integer, $2::integer, 2.0);",
        [id, type_id]
      );
    });

    res.set("Content-Type", "application/json");
    res.send({ message: "Type added successfully!" });

    await client.end();     //Close connection to database

  } catch (ex) {

    res.status(300).send({ error: "ERROR - Details provided in incorrect format" });

  }
});

//Post and add a new nature
app.post("/nature", async (req, res) => {
  try {
    const species = req.body;
    const client = new Client(clientConfig);
    await client.connect();     //Connect to database

    //Query for inserting details into moves table
    const nature_query = await client.query(
      "INSERT INTO NATURES(name, increased_stat, decreased_stat, description) VALUES ($1::text,$2::text,$3::text, $4::text);",
      [
        species["name"],
        species["increased_stat"],
        species["decreased_stat"],
        species["description"],
      ]
    );

    res.set("Content-Type", "application/json");
    res.send({ message: "Nature added successfully!" });

    await client.end();     //Close connection to database

  } catch (ex) {

    res.status(300).send({ error: "ERROR - Details provided in incorrect format" });

  }
});

app.put("/pokemon", async (req, res) => {
  const { id, name, species_id, moves, type, height, weight, stats } = req.body;
  if (!id) return res.status(300).send({ error: "ID is required" });

  const query = `
    UPDATE pokemon 
    SET 
      name = $2,
      species_id = $3,
      height = $4,
      weight = $5
    WHERE id = $1;
  `;

  try {
    const client = new Client(clientConfig);
    await client.connect()

    const roundedHeight = height ? Math.round(height) : null;
    const roundedWeight = weight ? Math.round(weight) : null;

    await client.query(query, [
      id,
      name,
      species_id,
      roundedHeight,
      roundedWeight,
    ]);

    if (moves) {
      await client.query(`DELETE FROM pokemon_moves WHERE pokemon_id = $1;`, [
        id,
      ]);
      await client.query(
        `INSERT INTO pokemon_moves (pokemon_id, move_id) SELECT $1, UNNEST($2::int[]);`,
        [id, moves]
      );
    }

    if (type) {
      await client.query(`DELETE FROM pokemon_types WHERE pokemon_id = $1;`, [
        id,
      ]);
      await client.query(
        `INSERT INTO pokemon_types (pokemon_id, type_id) SELECT $1, UNNEST($2::int[]);`,
        [id, type]
      );
    }

    if (stats) {
      const { hp, attack, defense, special_attack, special_defense, speed } =
        stats;
      await client.query(
        `DELETE FROM pokemon_base_stats WHERE pokemon_id = $1;`,
        [id]
      );
      await client.query(
        `
        INSERT INTO pokemon_base_stats (pokemon_id, hp, attack, defense, special_attack, special_defense, speed)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `,
        [id, hp, attack, defense, special_attack, special_defense, speed]
      );
    }

    res.status(200).send({ message: "Success" });
    await client.end();
  } catch (error) {
    res.status(300).send({ error: "Failed to update Pokémon" });
  }
});

app.put("/species", async (req, res) => {
  const { id, name } = req.body;
  if (!id) return res.status(300).send({ error: "ID is required" });

  const query = `
    UPDATE species 
    SET 
      name = $2
    WHERE id = $1;
  `;

  await updateDatabase(query, [id, name], res);
});

app.put("/moves", async (req, res) => {
  const { id, name, types_id, power, accuracy, power_point } = req.body;
  if (!id) return res.status(300).send({ error: "ID is required" });

  const query = `
    UPDATE moves 
    SET 
      name = $2,
			types_id = $3,
      power = $4,
      accuracy = $5,
      power_point = $6
    WHERE id = $1;
  `;

  await updateDatabase(
    query,
    [id, name, types_id, power, accuracy, power_point],
    res
  );
});

app.put("/types", async (req, res) => {
  const { id, name, effectiveness } = req.body;
  if (!id) return res.status(300).send({ error: "ID is required" });

  const query = `
    UPDATE types 
    SET 
      name = $2
    WHERE id = $1;
  `;
  //TODO: update types effectiveness
  await updateDatabase(query, [id, name], res);
});

app.put("/nature", async (req, res) => {
  const { id, name, increased_stat, decreased_stat, description } = req.body;
  if (!id) return res.status(300).send({ error: "ID is required" });

  const query = `
    UPDATE natures
    SET
			name = $2,
      increased_stat = $3,
      decreased_stat = $4,
      description = $5
    WHERE id = $1;
  `;

  await updateDatabase(
    query,
    [id, name, increased_stat, decreased_stat, description],
    res
  );
});

// Delete a specific species by ID
app.delete("/species/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    await client.query("DELETE FROM species WHERE id = $1", [id]);

    res.status(200).send(`Deleted successfully`);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e.message });
  }
});

// Delete a specific nature by ID
app.delete("/natures/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    await client.query("DELETE FROM natures WHERE id = $1", [id]);

    res.status(200).send(`Deleted successfully`);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e.message });
  }
});
// Delete a specific type by ID
app.delete("/types/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    await client.query("DELETE FROM types WHERE id = $1", [id]);

    res.status(200).send(`Deleted successfully`);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e.message });
  }
});
// Delete a specific move by ID
app.delete("/moves/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    await client.query("DELETE FROM moves WHERE id = $1", [id]);

    res.status(200).send(`Deleted successfully`);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e.message });
  }
});
// Delete a specific pokemon by ID
app.delete("/pokemon/:id", async function (req, res) {
  try {
    const { id } = req.params;
    const client = new Client(clientConfig);
    await client.connect();
    await client.query("DELETE FROM pokemon_types WHERE pokemon_id=$1", [id]);
    await client.query("DELETE FROM pokemon_moves WHERE pokemon_id=$1", [id]);
    await client.query("DELETE FROM pokemon_base_stats WHERE pokemon_id=$1", [
      id,
    ]);
    await client.query("DELETE FROM pokemon WHERE id = $1", [id]);

    res.status(200).send(`Deleted successfully`);

    await client.end();     //Close connection to database

  } catch (e) {
    res.status(500).send({ error: e.message });
  }
});

app.post('/upload', upload.single('image'), async (req, res) => {

  const file = req.file;

  //if no file is received in request
  if (!file) {

    return res.status(400).send('No file uploaded.');

  }

  //read data of file
  const fileStream = fs.createReadStream(file.path);

  //initialization of base parameters for upload request to be sent to S3
  const uploadParams = {

    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `${file.originalname}`,
    Body: fileStream, ContentType: file.mimetype
  };

  //upload image in S3 bucket
  try {

    await s3.send(new PutObjectCommand(uploadParams));

    fs.unlinkSync(file.path); // Delete file from local server after upload 

    res.set("Content-Type", "application/json");
    res.send('File uploaded successfully to AWS S3!');

  } catch (err) {

    console.error('Error uploading file:', err);
    res.status(500).send('Error uploading file');

  }
});