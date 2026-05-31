package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"droplink/config"
	"droplink/handlers"

	"github.com/go-chi/chi/v5"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	// Initialize required folders and schema
	config.InitDirs()

	r := chi.NewRouter()

	// Apply CORS
	r.Use(corsMiddleware)

	// API Routes
	r.Post("/api/transfers", handlers.CreateTransfer)
	r.Get("/api/transfers/{id}", handlers.GetTransferMetadata)
	r.Post("/api/transfers/{id}/unlock", handlers.UnlockTransfer)
	r.Get("/api/transfers/{id}/files/{fileId}", handlers.DownloadFile)

	// Web Routes: Serve share.html for clean link URLs
	r.Get("/link/{id}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(config.PublicDir, "share.html"))
	})

	// Static Assets & Fallback Router
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Clean(r.URL.Path)
		fullPath := filepath.Join(config.PublicDir, path)

		// Check if file exists and is a physical file (not a folder)
		info, err := os.Stat(fullPath)
		if err == nil && !info.IsDir() {
			http.ServeFile(w, r, fullPath)
			return
		}

		// Fallback to serving SPA index.html for undefined routes
		http.ServeFile(w, r, filepath.Join(config.PublicDir, "index.html"))
	})

	log.Printf("Server is running at http://localhost:%s", config.PORT)
	if err := http.ListenAndServe(":"+config.PORT, r); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
