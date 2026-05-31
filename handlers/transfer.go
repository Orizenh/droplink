package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"droplink/config"
	"droplink/database"
	"droplink/middlewares"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// PublicFile represents the sanitized file metadata returned to the client
type PublicFile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	MimeType string `json:"mimetype"`
}

// mapToPublicFiles converts database.FileMetadata slice to PublicFile slice
func mapToPublicFiles(files []database.FileMetadata) []PublicFile {
	publicFiles := make([]PublicFile, 0, len(files))
	for _, f := range files {
		publicFiles = append(publicFiles, PublicFile{
			ID:       f.ID,
			Name:     f.Name,
			Size:     f.Size,
			MimeType: f.MimeType,
		})
	}
	return publicFiles
}

// respondWithJSON helper writes a JSON response with appropriate headers
func respondWithJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

// checkTransferDates checks if a transfer is pending or expired, returning the appropriate error and HTTP status
func checkTransferDates(transfer database.Transfer) (string, int) {
	dateStatus := middlewares.ValidateTransferDates(transfer)
	if dateStatus == "pending" {
		return "Ce transfert n'est pas encore actif.", http.StatusForbidden
	}
	if dateStatus == "expired" {
		return "Ce transfert a expiré.", http.StatusForbidden
	}
	return "", 0
}

// CreateTransfer handles POST /api/transfers
func CreateTransfer(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form up to 100MB
	err := r.ParseMultipartForm(100 * 1024 * 1024)
	if err != nil {
		respondWithJSON(w, http.StatusBadRequest, map[string]string{"error": "Le chargement des fichiers a échoué."})
		return
	}

	title := r.FormValue("title")
	textContent := r.FormValue("textContent")
	password := r.FormValue("password")
	startDateStr := r.FormValue("startDate")
	endDateStr := r.FormValue("endDate")
	customSlug := r.FormValue("customSlug")

	// Validate payload
	errMsg, sanitizedSlug := middlewares.ValidateTransferCreation(title, customSlug, startDateStr, endDateStr)
	if errMsg != "" {
		respondWithJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if sanitizedSlug != "" {
		customSlug = sanitizedSlug
	}

	// Parse date fields
	var startDate *time.Time
	if startDateStr != "" {
		if t, err := time.Parse(time.RFC3339, startDateStr); err == nil {
			startDate = &t
		} else if t, err := time.Parse("2006-01-02T15:04", startDateStr); err == nil {
			startDate = &t
		}
	}

	var endDate *time.Time
	if endDateStr != "" {
		if t, err := time.Parse(time.RFC3339, endDateStr); err == nil {
			endDate = &t
		} else if t, err := time.Parse("2006-01-02T15:04", endDateStr); err == nil {
			endDate = &t
		}
	}

	// Map and write files
	var files []database.FileMetadata
	fileHeaders := r.MultipartForm.File["files"]
	for _, fileHeader := range fileHeaders {
		file, err := fileHeader.Open()
		if err != nil {
			respondWithJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read uploaded file."})
			return
		}
		defer file.Close()

		// Generate unique storage filename: <uuid><ext>
		uniqueID := uuid.New().String()
		ext := filepath.Ext(fileHeader.Filename)
		uniqueFilename := uniqueID + ext
		filePath := filepath.Join(config.UploadsDir, uniqueFilename)

		// Create file on disk
		out, err := os.Create(filePath)
		if err != nil {
			respondWithJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save file on server."})
			return
		}
		defer out.Close()

		_, err = io.Copy(out, file)
		if err != nil {
			respondWithJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to write file contents."})
			return
		}

		files = append(files, database.FileMetadata{
			ID:       uuid.New().String(),
			Name:     fileHeader.Filename,
			MimeType: fileHeader.Header.Get("Content-Type"),
			Size:     fileHeader.Size,
			Filename: uniqueFilename,
		})
	}

	// Determine final ID/slug
	transferId := customSlug
	if transferId == "" {
		transferId = uuid.New().String()[:8]
	}

	var passwordHash *string
	if password != "" {
		h := database.HashPassword(password)
		passwordHash = &h
	}

	transfer := database.Transfer{
		ID:           transferId,
		Title:        strings.TrimSpace(title),
		TextContent:  textContent,
		PasswordHash: passwordHash,
		HasPassword:  password != "",
		StartDate:    startDate,
		EndDate:      endDate,
		CreatedAt:    time.Now(),
		Files:        files,
	}

	err = database.SaveTransfer(transfer)
	if err != nil {
		respondWithJSON(w, http.StatusInternalServerError, map[string]string{"error": "Une erreur serveur est survenue lors de l'enregistrement."})
		return
	}

	respondWithJSON(w, http.StatusCreated, map[string]interface{}{
		"success":    true,
		"transferId": transferId,
		"url":        "/link/" + transferId,
	})
}

// GetTransferMetadata handles GET /api/transfers/:id
func GetTransferMetadata(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	transfer, err := database.GetTransfer(id)
	if err != nil {
		respondWithJSON(w, http.StatusNotFound, map[string]string{"error": "Transfert introuvable ou expiré."})
		return
	}

	// Verify dates
	dateStatus := middlewares.ValidateTransferDates(transfer)
	if dateStatus == "pending" {
		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"status":      "pending",
			"title":       transfer.Title,
			"startDate":   transfer.StartDate,
			"hasPassword": transfer.HasPassword,
		})
		return
	}
	if dateStatus == "expired" {
		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "expired",
			"title":   transfer.Title,
			"endDate": transfer.EndDate,
		})
		return
	}

	// Verify password lock
	if transfer.HasPassword {
		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"status":      "locked",
			"id":          transfer.ID,
			"title":       transfer.Title,
			"hasPassword": true,
			"filesCount":  len(transfer.Files),
			"createdAt":   transfer.CreatedAt,
			"endDate":     transfer.EndDate,
		})
		return
	}

	// Public/Accessible payload
	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "unlocked",
		"id":          transfer.ID,
		"title":       transfer.Title,
		"textContent": transfer.TextContent,
		"createdAt":   transfer.CreatedAt,
		"endDate":     transfer.EndDate,
		"files":       mapToPublicFiles(transfer.Files),
	})
}

// UnlockTransfer handles POST /api/transfers/:id/unlock
func UnlockTransfer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Password string `json:"password"`
	}
	err := json.NewDecoder(r.Body).Decode(&body)
	if err != nil {
		respondWithJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload de mot de passe invalide."})
		return
	}

	transfer, err := database.GetTransfer(id)
	if err != nil {
		respondWithJSON(w, http.StatusNotFound, map[string]string{"error": "Transfert introuvable."})
		return
	}

	// Validate dates
	if errMsg, errCode := checkTransferDates(transfer); errMsg != "" {
		respondWithJSON(w, errCode, map[string]string{"error": errMsg})
		return
	}

	// Verify password
	if transfer.HasPassword {
		incomingHash := database.HashPassword(body.Password)
		if transfer.PasswordHash == nil || incomingHash != *transfer.PasswordHash {
			respondWithJSON(w, http.StatusUnauthorized, map[string]string{"error": "Mot de passe incorrect."})
			return
		}
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"textContent": transfer.TextContent,
		"files":       mapToPublicFiles(transfer.Files),
	})
}

// DownloadFile handles GET /api/transfers/:id/files/:fileId
func DownloadFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	fileId := chi.URLParam(r, "fileId")
	password := r.URL.Query().Get("password")

	transfer, err := database.GetTransfer(id)
	if err != nil {
		http.Error(w, "Transfert introuvable.", http.StatusNotFound)
		return
	}

	// Verify dates
	if errMsg, errCode := checkTransferDates(transfer); errMsg != "" {
		http.Error(w, errMsg, errCode)
		return
	}

	// Verify password lock
	if transfer.HasPassword {
		incomingHash := database.HashPassword(password)
		if transfer.PasswordHash == nil || incomingHash != *transfer.PasswordHash {
			http.Error(w, "Accès refusé : mot de passe incorrect.", http.StatusUnauthorized)
			return
		}
	}

	// Locate file in metadata list
	var targetFile *database.FileMetadata
	for _, f := range transfer.Files {
		if f.ID == fileId {
			targetFile = &f
			break
		}
	}

	if targetFile == nil {
		http.Error(w, "Fichier introuvable.", http.StatusNotFound)
		return
	}

	filePath := filepath.Join(config.UploadsDir, targetFile.Filename)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "Fichier manquant sur le serveur.", http.StatusNotFound)
		return
	}

	// Set download headers to prompt sequential downloading
	w.Header().Set("Content-Disposition", "attachment; filename=\""+targetFile.Name+"\"")
	w.Header().Set("Content-Type", targetFile.MimeType)
	http.ServeFile(w, r, filePath)
}
