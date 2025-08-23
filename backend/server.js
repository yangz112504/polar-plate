require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const cors = require('cors');
const menusRoute = require("./routes/menu.js");

const app = express();
const PORT = process.env.PORT || 5001;
const SECRET_KEY = process.env.SECRET_KEY;
const saltRounds = 10;

// MongoDB set up
const uri = process.env.MONGO_URI;
mongoose.connect(uri, { dbName: 'fansDB' })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Schemas

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

// Rating Schema
const ratingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  hall: { type: String, required: true },
  meal: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  date: { type: String, required: true }, // store as YYYY-MM-DD string
}, { timestamps: true });

const Rating = mongoose.model("Rating", ratingSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,  // e.g. https://polarplate.onrender.com
    "http://localhost:3000"    // local dev
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.get("/healthz", (req, res) => res.status(200).send("ok"));

app.use('/api/menus', menusRoute)

// JWT Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Routes

// Register user
app.post('/api/users', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) return res.status(400).json({ message: "All fields are required" });

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    const token = jwt.sign({ userId: newUser._id, username: newUser.username }, SECRET_KEY, { expiresIn: '7d' });

    res.status(201).json({ message: "Successfully registered", success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Login
app.post('/api/sessions', async (req, res) => {
  const { username, email, password } = req.body;

  if (!password || (!username && !email)) return res.status(400).json({ message: "Username or email and password required" });

  try {
    const user = await User.findOne(username ? { username } : { email });
    if (!user) return res.status(401).json({ message: "User does not exist" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id, username: user.username }, SECRET_KEY, { expiresIn: '7d' });

    res.json({ message: "Login successful", success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Get current user
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// Submit or update a rating
app.post('/api/ratings', authenticateToken, async (req, res) => {
  const { hall, meal, rating, date } = req.body;
  if (!hall || !meal || !rating || !date) {
    return res.status(400).json({ message: "Hall, meal, and rating required" });
  }

  let updated;
  try {
    // Check if user already rated this meal
    let userRating = await Rating.findOne({ user: req.user.userId, hall, meal, date });

    if (userRating) {
      userRating.rating = rating; // update
      await userRating.save();
      updated = true;
    } else {
      userRating = new Rating({ user: req.user.userId, hall, meal, rating, date });
      await userRating.save();
      updated = false;
    }

    // Recalculate average + total votes
      const stats = await Rating.aggregate([
        {
          $match: { hall, meal, date} // filter ratings by hall and meal
        },
        {
          $group: {
            _id: null, // single group for all matched ratings
            avgRating: { $avg: "$rating" }, // average of rating values
            totalRatings: { $sum: 1 }       // count of documents
          }
        }
      ]);

      let avgRating = 0;
      let totalRatings = 0;

      if (stats.length > 0) {
        avgRating = stats[0].avgRating.toFixed(2);
        totalRatings = stats[0].totalRatings;
      }


    res.json({
      message: "Rating saved",
      avgRating,
      totalRatings,
      updated,
      userRating: rating,

    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//Get user's rating
app.get('/api/ratings/user', authenticateToken, async(req,res)=>{
  try{
    const { hall, meal, date } = req.query;

    if (!hall || !meal || !date) {
      return res.status(400).json({ message: "Hall, meal, and date required" });
    }

    const userRating = await Rating.findOne({ user: req.user.userId, hall, meal, date });

    res.json({
      userRating: userRating?.rating || null
    })
  }catch(err){
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
})

// Get ALL ratings for hall+meal+date
app.get('/api/ratings/:hall/:meal/:date', authenticateToken, async (req, res) => {
  try {
    const { hall, meal, date } = req.params;

    // Find all ratings, populate user info (but not password)
    const ratings = await Rating.find({ hall, meal, date })
      .select("rating").sort({ rating: -1 });

    res.json({ ratings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Return average and total ratings for a hall and meal
app.get('/api/ratings/:hall/:meal', authenticateToken, async (req, res) => {
  const { hall, meal } = req.params;
  const {date} = req.query;

  try {
   const stats = await Rating.aggregate([
      { $match: { hall, meal, date } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 }
        }
      }
    ]);

      let avgRating = 0;
      let totalRatings = 0;

      if (stats.length > 0) {
        avgRating = stats[0].avgRating.toFixed(2);
        totalRatings = stats[0].totalRatings;
      }

    res.json({
      avgRating,
      totalRatings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Logout
app.delete('/api/sessions', (req, res) => {
  res.status(200).json({ message: "Logged out (stateless)" });
});

// Starting the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
