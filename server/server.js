import express from 'express'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors({
  origin: true,
  credentials: true
}))
app.use(express.json())

let pool

async function initDB() {
  // First connect without database to create it
  const tempPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10
  })

  // Create database if not exists
  await tempPool.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`)
  await tempPool.end()

  // Now connect to the database
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
  })

  // Create tables
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      color VARCHAR(50),
      date DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      color VARCHAR(50),
      due_date DATETIME,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT,
      link_type VARCHAR(50),
      link_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  console.log('Database initialized successfully')
}

initDB().catch(console.error)

// Middleware to verify JWT
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = decoded.id
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body
    
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email])
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const [result] = await pool.execute(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email, hashedPassword, name || email.split('@')[0]]
    )

    const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, userId: result.insertId, email, name: name || email.split('@')[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body
    
    const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email])
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const user = users[0]
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, userId: user.id, email: user.email, name: user.name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Events CRUD
app.get('/api/events', authenticate, async (req, res) => {
  try {
    const [events] = await pool.execute(
      'SELECT * FROM events WHERE user_id = ? ORDER BY date',
      [req.userId]
    )
    res.json(events)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch events' })
  }
})

app.post('/api/events', authenticate, async (req, res) => {
  try {
    const { title, description, color, date } = req.body
    const formattedDate = new Date(date).toISOString().replace('T', ' ').replace('Z', '')
    const [result] = await pool.execute(
      'INSERT INTO events (user_id, title, description, color, date) VALUES (?, ?, ?, ?, ?)',
      [req.userId, title, description, color, formattedDate]
    )
    res.json({ id: result.insertId, title, description, color, date, user_id: req.userId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create event' })
  }
})

app.put('/api/events/:id', authenticate, async (req, res) => {
  try {
    const { title, description, color, date } = req.body
    const formattedDate = new Date(date).toISOString().replace('T', ' ').replace('Z', '')
    await pool.execute(
      'UPDATE events SET title = ?, description = ?, color = ?, date = ? WHERE id = ? AND user_id = ?',
      [title, description, color, formattedDate, req.params.id, req.userId]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update event' })
  }
})

app.delete('/api/events/:id', authenticate, async (req, res) => {
  try {
    await pool.execute('DELETE FROM events WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete event' })
  }
})

// Tasks CRUD
app.get('/api/tasks', authenticate, async (req, res) => {
  try {
    const [tasks] = await pool.execute(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY due_date',
      [req.userId]
    )
    res.json(tasks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

app.post('/api/tasks', authenticate, async (req, res) => {
  try {
    const { title, description, color, due_date, status } = req.body
    const formattedDate = due_date ? new Date(due_date).toISOString().replace('T', ' ').replace('Z', '') : null
    const [result] = await pool.execute(
      'INSERT INTO tasks (user_id, title, description, color, due_date, status) VALUES (?, ?, ?, ?, ?, ?)',
      [req.userId, title, description, color, formattedDate, status || 'pending']
    )
    res.json({ id: result.insertId, title, description, color, due_date, status: status || 'pending', user_id: req.userId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create task' })
  }
})

app.put('/api/tasks/:id', authenticate, async (req, res) => {
  try {
    const { title, description, color, due_date, status } = req.body
    const formattedDate = due_date ? new Date(due_date).toISOString().replace('T', ' ').replace('Z', '') : null
    await pool.execute(
      'UPDATE tasks SET title = ?, description = ?, color = ?, due_date = ?, status = ? WHERE id = ? AND user_id = ?',
      [title, description, color, formattedDate, status, req.params.id, req.userId]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

app.delete('/api/tasks/:id', authenticate, async (req, res) => {
  try {
    await pool.execute('DELETE FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

// Notes CRUD
app.get('/api/notes', authenticate, async (req, res) => {
  try {
    const [notes] = await pool.execute(
      'SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC',
      [req.userId]
    )
    res.json(notes)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch notes' })
  }
})

app.post('/api/notes', authenticate, async (req, res) => {
  try {
    const { title, content, link_type, link_id } = req.body
    const [result] = await pool.execute(
      'INSERT INTO notes (user_id, title, content, link_type, link_id) VALUES (?, ?, ?, ?, ?)',
      [req.userId, title, content, link_type, link_id || null]
    )
    res.json({ id: result.insertId, title, content, link_type, link_id, user_id: req.userId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create note' })
  }
})

app.put('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { title, content, link_type, link_id } = req.body
    await pool.execute(
      'UPDATE notes SET title = ?, content = ?, link_type = ?, link_id = ? WHERE id = ? AND user_id = ?',
      [title, content, link_type, link_id, req.params.id, req.userId]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update note' })
  }
})

app.delete('/api/notes/:id', authenticate, async (req, res) => {
  try {
    await pool.execute('DELETE FROM notes WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete note' })
  }
})

// Notifications CRUD
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const [notifications] = await pool.execute(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [req.userId]
    )
    res.json(notifications)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

app.post('/api/notifications', authenticate, async (req, res) => {
  try {
    const { title, description } = req.body
    const [result] = await pool.execute(
      'INSERT INTO notifications (user_id, title, description) VALUES (?, ?, ?)',
      [req.userId, title, description]
    )
    res.json({ id: result.insertId, title, description, user_id: req.userId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create notification' })
  }
})

app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to mark notification as read' })
  }
})

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`)
})
