# ✈️ DropLink

A premium, custom, and highly secure link-sharing and rich notes storage platform, engineered with a modern, modular architecture in **Go (Golang)** and fully containerized in Docker.

DropLink functions similarly to WeTransfer but adds advanced security layers, mandatory transfer naming, activation/expiration dates, custom URL slugs, secure owner-authenticated deletion, and zero central server tracking.

---

## 🚀 Key Features

* **Mandatory Naming**: Every share link must be named, ensuring clean organization on the recipient landing views.
* **Clean URL Routing**: Fully resolved paths (`/link/:id` or `/link/:custom-slug`) instead of messy query parameters.
* **Zero Leak Security**: For password-locked links, file lists and text contents are strictly withheld by the server until correct password verification (preventing client-side inspection).
* **SHA-256 Hashing**: Passwords are securely hashed using SHA-256 before saving to the database.
* **Strict Date Boundaries**: Expired links and pending (future activation) links are validated and blocked server-side.
* **Private Log History**: The "My Transfers" list is completely stored in the browser's `localStorage` of the creator. Third parties cannot see what you shared.
* **Secure Link Deletion**: Creators can permanently delete a link. This destroys the associated physical files from the server's disk and wipes the record from `database.json`. Deletion requires validation of a secret `deleteToken` generated at link creation and stored securely in the creator's browser `localStorage`.
* **Popup-Blocker Safe Downloader**: Sequential downloader with 400ms interval delays to bypass native browser multiple popup blocks.
* **Vibrant Glassmorphic UI**: Sleek slate-dark theme utilizing Outfit typography, glassmorphism boundaries, and smooth CSS animations.

---

## 🛠️ Tech Stack

| Layer | Component | Detail |
| :--- | :--- | :--- |
| **Frontend** | HTML5, Vanilla CSS3, ES6 JavaScript | Glassmorphism visual elements, responsive layouts, native browser ES Modules. |
| **Backend** | Go (Golang) + `chi` Router (v5) | High performance, modular HTTP handler architecture. |
| **File Handling** | Standard Library (`mime/multipart`) | Multipart/form-data upload system mapping files with unique UUIDs. |
| **Security** | Standard Library (`crypto/sha256`) | SHA-256 secure cryptographic password hashing. |
| **Database** | Lightweight Local JSON | Dynamic, self-creating metadata store in `data/database.json`. |
| **Containerization** | Docker | Two-stage lean container built on `golang:1.26-alpine` and run on `alpine:3.19`. |

---

## 📦 Project Architecture

DropLink Go is designed around **SOLID** and **Separation of Concerns** principles:

```
├── config/
│   └── config.go         # Unified configurations, uploads, and data directory bounds.
├── database/
│   └── db.go             # DB storage (Read/Write) and SHA-256 password hashing.
├── middlewares/
│   └── validator.go      # Go middleware validating payloads, slugs, and date boundaries.
├── handlers/
│   └── transfer.go       # HTTP handlers managing transfer lifecycles and physical file operations.
├── public/               # Public web assets (HTML, CSS, JS, sw.js)
├── main.go               # chi router registration, CORS, and web root handler.
```

---

## 🏁 Quick Start

### 1. Running Natively (Go)

Ensure you have Go installed on your system.

```bash
# Start the Go server directly
go run main.go

# Or compile and run the release binary
go build -o droplink
./droplink
```

*Access the application by visiting:* **`http://localhost:3000`**

### 2. Running with Docker

DropLink is ready to run out of the box using Docker:

```bash
# 1. Build the Docker image
docker build -t droplink .

# 2. Run the container with persistent volumes
docker run -d -p 3000:3000 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/data:/app/data \
  --name droplink-container droplink
```

---

## 🧪 Automated Testing

We include a custom, comprehensive API testing suite verifying all secure behaviors (password locks, data masking, date expiration limits, and secure link deletion):

```bash
# Run the API test suite (ensure the server is running on port 3000 first)
node test-api.js
```
