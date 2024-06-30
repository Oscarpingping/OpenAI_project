import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

// Set up OpenAI
const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: openaiApiKey });

// Set up storage for uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // Limit file size to 10MB
    }
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const encodeImageToBase64 = (filePath) => {
    const imageBuffer = fs.readFileSync(filePath);
    return imageBuffer.toString('base64');
};

app.post('/upload', upload.single('file'), async (req, res) => {
    const question = req.body.question;

    if (!question) {
        return res.status(400).json({ success: false, message: 'Question is required.' });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Image file is required.' });
    }

    const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);
    const fileType = path.extname(req.file.originalname).toLowerCase();
    const validImageTypes = ['.jpg', '.jpeg', '.png'];

    if (!validImageTypes.includes(fileType)) {
        fs.unlinkSync(filePath); // Delete unsupported file type
        return res.status(400).json({ success: false, message: 'Invalid file type.' });
    }

    try {
        const base64Image = encodeImageToBase64(filePath);
        const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;

        const content = [
            { type: "text", text: question },
            {
                type: "image_url",
                image_url: { url: dataUrl }
            }
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: content
                },
            ],
            max_tokens: 300,
        });

        res.json({ success: true, message: completion.choices[0].message.content });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Error processing image.' });
    } finally {
        // Clean up the uploaded file
        fs.unlinkSync(filePath);
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});