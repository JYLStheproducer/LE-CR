// server.js
require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Error: MONGODB_URI is not defined in the environment variables.");
  process.exit(1);
}

const client = new MongoClient(uri);
let db;

// Connect to MongoDB once and reuse the connection
async function connectDB() {
  if (!db) {
    try {
      await client.connect();
      console.log("Connected to MongoDB");
      db = client.db('taskManager');
    } catch (error) {
      console.error("MongoDB connection error:", error);
      throw error;
    }
  }
  return db.collection('tasks');
}

// Gracefully handle server shutdown
process.on('SIGINT', async () => {
  console.log("Closing MongoDB connection...");
  await client.close();
  console.log("MongoDB connection closed.");
  process.exit(0);
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle the root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Créer une tâche
app.post('/tasks', async (req, res) => {
  try {
    const collection = await connectDB();
    const newTask = {
      text: req.body.text,
      completed: false,
      dueDate: req.body.dueDate,
      priority: req.body.priority,
      category: req.body.category,
      createdAt: new Date(),
      userId: req.body.userId,
      userName: req.body.userName
    };
    const result = await collection.insertOne(newTask);
    res.status(201).json({ _id: result.insertedId, ...newTask });
  } catch (e) {
    console.error("Error creating task:", e);
    res.status(500).json({ error: e.message });
  }
});

// Récupérer les tâches
app.get('/tasks', async (req, res) => {
  try {
    const collection = await connectDB();
    const tasks = await collection.find().sort({ dueDate: 1 }).toArray();
    res.json(tasks);
  } catch (e) {
    console.error("Error fetching tasks:", e);
    res.status(500).json({ error: e.message });
  }
});

// Mettre à jour une tâche
app.patch('/tasks/:id', async (req, res) => {
  try {
    const collection = await connectDB();
    const result = await collection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.json(result);
  } catch (e) {
    console.error("Error updating task:", e);
    res.status(500).json({ error: e.message });
  }
});

// Supprimer une tâche spécifique
app.delete('/tasks/:id', async (req, res) => {
  try {
    const collection = await connectDB();
    const result = await collection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }
    res.status(204).send();
  } catch (e) {
    console.error("Error deleting task:", e);
    res.status(500).json({ error: e.message });
  }
});

// Supprimer toutes les tâches
app.delete('/tasks', async (req, res) => {
  try {
    const collection = await connectDB();
    const result = await collection.deleteMany({});
    res.status(200).json({ message: `${result.deletedCount} tâches supprimées` });
  } catch (e) {
    console.error("Error deleting all tasks:", e);
    res.status(500).json({ error: e.message });
  }
});

// Handle invalid routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Handle server errors
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Check if HTTPS is required
const useHttps = process.env.USE_HTTPS === 'true';
let server;

if (useHttps) {
  try {
    const key = fs.readFileSync(path.join(__dirname, 'certs', 'key.pem'));
    const cert = fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem'));

    server = https.createServer({ key, cert }, app);
    console.log("Server running with HTTPS");
  } catch (error) {
    console.error("Error setting up HTTPS. Falling back to HTTP:", error.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
  console.log("Server running with HTTP");
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Handle EADDRINUSE error
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Trying another port...`);
    server.listen(0, () => {
      const newPort = server.address().port;
      console.log(`Server running on port ${newPort}`);
    });
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});