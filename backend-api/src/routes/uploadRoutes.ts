import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middleware/authMiddleware";
import { uploadLeadsCSV, uploadMetaTemplateSample } from "../controllers/uploadController";

const router = Router();

// Ensure uploads directory exists at the root of the backend project
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename to prevent overwriting
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// ✅ STRICT FILE SANITIZATION
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "video/mp4"
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only CSV, JPEG, PNG, WEBP, MP4, and PDF are allowed."));
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for WhatsApp compatibility
});

// ✅ MULTI-TENANCY: Lock down upload routes
router.use(authMiddleware);

// Standard Media Upload
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded or invalid format" });
  }

  // Generate public URL. 
  // NOTE: Meta/WhatsApp cannot see 'localhost'. Use your ngrok/public URL here.
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

  res.json({ 
    url: fileUrl,
    filename: req.file.filename 
  });
});

router.post("/meta-template-sample", upload.single("file"), uploadMetaTemplateSample);

// CSV Leads Upload
router.post("/csv", upload.single("file"), uploadLeadsCSV);

export default router;
