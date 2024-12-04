const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 8080;

// Middleware to parse JSON requests
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000' }));

// Ensure the "uploads" directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve static files from the "uploads" directory
app.use('/uploads', express.static(uploadDir));

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/users', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Define a Mongoose schema and model
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    image: { type: String } // Store the URL to the image
});

const User = mongoose.model('User', userSchema);

// Sanitize the filename to avoid issues with invalid characters
const sanitizeFilename = (filename) => {
    return filename.replace(/[<>:"/\\|?*]/g, '_'); // Replaces invalid characters with underscores
};

// Set up Multer for file uploads with file type validation
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const sanitizedFileName = sanitizeFilename(file.originalname);
        cb(null, Date.now() + '-' + sanitizedFileName);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        // Allow only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Routes
//! Default route
app.get('/', (req, res) => {
    res.send('Hello World!');
});

//! Create a new user
app.post('/addUser', upload.single('image'), async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const image = req.file ? `/uploads/${req.file.filename}` : null; // Save the relative URL

        const newUser = new User({ username, email, password, image });
        await newUser.save();
        res.status(201).json(newUser);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//! Get all users
app.get('/users', async (req, res) => {
    try {
        const users = await User.find();

        // If you want to make sure the full URL of the image is sent
        // You can prepend the base URL (e.g., http://localhost:8080) to the image path
        const usersWithImage = users.map(user => {
            // Check if user has an image and prepend the base URL
            if (user.image) {
                user.image = `http://localhost:8080${user.image}`;
            }
            return user;
        });

        res.status(200).json(usersWithImage);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


//! Get a user by ID
app.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//! Update a user by ID
app.put('/users/:id', upload.single('image'), async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const image = req.file ? `/uploads/${req.file.filename}` : undefined;

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { username, email, password, ...(image && { image }) },
            { new: true }
        );

        if (!updatedUser) return res.status(404).json({ error: 'User not found' });
        res.status(200).json(updatedUser);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//! Delete a user by ID
app.delete('/users/:id', async (req, res) => {
    try {
        const deletedUser = await User.findByIdAndDelete(req.params.id);
        if (!deletedUser) return res.status(404).json({ error: 'User not found' });
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//! Get user image by ID route
app.get('/userImage/:id', async (req, res) => {
    try {
        // Find the user by ID
        const user = await User.findById(req.params.id);

        // If user or image is not found, send a 404 response
        if (!user || !user.image) {
            return res.status(404).json({ error: 'User not found or image not available' });
        }

        // Get the image file path from the user's data (using dynamic path joining)
        const imagePath = path.join(__dirname, 'uploads', path.basename(user.image));

        // Send the image file
        res.sendFile(imagePath, (err) => {
            if (err) {
                // Handle errors if the file can't be sent
                res.status(500).json({ error: 'Error sending the image file', details: err.message });
            }
        });
    } catch (err) {
        // Handle any other errors (e.g., invalid ID format or database issues)
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

// Start the server
app.listen(PORT, () => console.log(`The server is running at http://localhost:${PORT}`));
