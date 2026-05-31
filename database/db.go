package database

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"os"
	"sync"
	"time"

	"droplink/config"
)

// FileMetadata represents physical file metadata inside a transfer
type FileMetadata struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	MimeType string `json:"mimetype"`
	Size     int64  `json:"size"`
	Filename string `json:"filename"`
}

// Transfer represents a single link share package
type Transfer struct {
	ID           string         `json:"id"`
	Title        string         `json:"title"`
	TextContent  string         `json:"textContent"`
	PasswordHash *string        `json:"passwordHash"`
	HasPassword  bool           `json:"hasPassword"`
	StartDate    *time.Time     `json:"startDate"`
	EndDate      *time.Time     `json:"endDate"`
	CreatedAt    time.Time      `json:"createdAt"`
	Files        []FileMetadata `json:"files"`
}

// DBRepresentation is the root JSON database structure
type DBRepresentation struct {
	Transfers map[string]Transfer `json:"transfers"`
}

var (
	dbLock sync.RWMutex
)

// HashPassword hashes a raw password using SHA-256 and returns its hex representation
func HashPassword(password string) string {
	if password == "" {
		return ""
	}
	hash := sha256.New()
	hash.Write([]byte(password))
	return hex.EncodeToString(hash.Sum(nil))
}

// ReadDatabase reads the JSON database safely with a read lock
func ReadDatabase() (DBRepresentation, error) {
	dbLock.RLock()
	defer dbLock.RUnlock()

	data, err := os.ReadFile(config.DbFile)
	if err != nil {
		log.Printf("Error reading database file: %v", err)
		return DBRepresentation{Transfers: make(map[string]Transfer)}, err
	}

	var db DBRepresentation
	if err := json.Unmarshal(data, &db); err != nil {
		log.Printf("Error unmarshaling database: %v", err)
		// Return empty representation if parsing fails
		return DBRepresentation{Transfers: make(map[string]Transfer)}, err
	}

	if db.Transfers == nil {
		db.Transfers = make(map[string]Transfer)
	}

	return db, nil
}

// WriteDatabase writes the database representation back to disk safely with a write lock
func WriteDatabase(db DBRepresentation) error {
	dbLock.Lock()
	defer dbLock.Unlock()

	data, err := json.MarshalIndent(db, "", "  ")
	if err != nil {
		log.Printf("Error marshaling database for save: %v", err)
		return err
	}

	if err := os.WriteFile(config.DbFile, data, 0644); err != nil {
		log.Printf("Error writing database to disk: %v", err)
		return err
	}

	return nil
}

// SaveTransfer inserts or updates a transfer record
func SaveTransfer(transfer Transfer) error {
	db, err := ReadDatabase()
	if err != nil {
		// If read failed, initialize fresh map
		db = DBRepresentation{Transfers: make(map[string]Transfer)}
	}

	db.Transfers[transfer.ID] = transfer
	return WriteDatabase(db)
}

// GetTransfer fetches a transfer record by ID
func GetTransfer(id string) (Transfer, error) {
	db, err := ReadDatabase()
	if err != nil {
		return Transfer{}, err
	}

	transfer, exists := db.Transfers[id]
	if !exists {
		return Transfer{}, errors.New("transfer not found")
	}

	return transfer, nil
}
