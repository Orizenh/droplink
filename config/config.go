package config

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
)

var (
	PORT        string
	RootDir     string
	UploadsDir  string
	DataDir     string
	DbFile      string
	PublicDir   string
)

func init() {
	// Default port to 3000, check environment variable PORT
	PORT = os.Getenv("PORT")
	if PORT == "" {
		PORT = "3000"
	}

	// Working directory is the root
	var err error
	RootDir, err = os.Getwd()
	if err != nil {
		log.Fatalf("Failed to get current working directory: %v", err)
	}

	UploadsDir = filepath.Join(RootDir, "uploads")
	DataDir = filepath.Join(RootDir, "data")
	DbFile = filepath.Join(DataDir, "database.json")
	PublicDir = filepath.Join(RootDir, "public")
}

// InitDirs initializes all application folders and the database file if missing
func InitDirs() {
	// Create uploads directory if not exists
	if _, err := os.Stat(UploadsDir); os.IsNotExist(err) {
		if err := os.MkdirAll(UploadsDir, 0755); err != nil {
			log.Fatalf("Failed to create uploads directory: %v", err)
		}
	}

	// Create data directory if not exists
	if _, err := os.Stat(DataDir); os.IsNotExist(err) {
		if err := os.MkdirAll(DataDir, 0755); err != nil {
			log.Fatalf("Failed to create data directory: %v", err)
		}
	}

	// Create database.json if not exists
	if _, err := os.Stat(DbFile); os.IsNotExist(err) {
		emptyDb := map[string]interface{}{
			"transfers": map[string]interface{}{},
		}
		data, err := json.MarshalIndent(emptyDb, "", "  ")
		if err != nil {
			log.Fatalf("Failed to marshal empty database schema: %v", err)
		}
		if err := os.WriteFile(DbFile, data, 0644); err != nil {
			log.Fatalf("Failed to write empty database file: %v", err)
		}
	}
}
