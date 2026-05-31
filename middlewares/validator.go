package middlewares

import (
	"regexp"
	"strings"
	"time"

	"droplink/database"
)

var nonAlphaNumRegex = regexp.MustCompile(`[^a-z0-9-_]`)

// SanitizeSlug trims, lowercases, and removes non-alphanumeric chars (except dash/underscore)
func SanitizeSlug(slug string) string {
	slug = strings.TrimSpace(slug)
	slug = strings.ToLower(slug)
	slug = nonAlphaNumRegex.ReplaceAllString(slug, "")
	return slug
}

// ValidateTransferDates returns "pending" if not yet active, "expired" if expired, or "" if valid
func ValidateTransferDates(transfer database.Transfer) string {
	now := time.Now()
	if transfer.StartDate != nil && now.Before(*transfer.StartDate) {
		return "pending"
	}
	if transfer.EndDate != nil && now.After(*transfer.EndDate) {
		return "expired"
	}
	return ""
}

// ValidateTransferCreation checks the creation arguments and returns error message if invalid
func ValidateTransferCreation(title string, customSlug string, startDateStr string, endDateStr string) (string, string) {
	// 1. Title validation
	if strings.TrimSpace(title) == "" {
		return "Le nom du transfert est obligatoire.", ""
	}

	// Parse dates to validate boundary
	var startVal, endVal time.Time
	var hasStart, hasEnd bool

	if startDateStr != "" {
		if t, err := time.Parse(time.RFC3339, startDateStr); err == nil {
			startVal = t
			hasStart = true
		} else if t, err := time.Parse("2006-01-02T15:04", startDateStr); err == nil {
			// fallback for standard HTML datetime-local formats
			startVal = t
			hasStart = true
		}
	}

	if endDateStr != "" {
		if t, err := time.Parse(time.RFC3339, endDateStr); err == nil {
			endVal = t
			hasEnd = true
		} else if t, err := time.Parse("2006-01-02T15:04", endDateStr); err == nil {
			// fallback for standard HTML datetime-local formats
			endVal = t
			hasEnd = true
		}
	}

	if hasStart && hasEnd && (startVal.After(endVal) || startVal.Equal(endVal)) {
		return "La date d'expiration doit être postérieure à la date d'activation.", ""
	}

	// 2. Custom slug validation
	if customSlug != "" {
		sanitizedSlug := SanitizeSlug(customSlug)
		if len(sanitizedSlug) < 3 {
			return "Le lien personnalisé doit faire au moins 3 caractères (lettres, chiffres, tirets).", ""
		}

		db, err := database.ReadDatabase()
		if err == nil {
			if _, exists := db.Transfers[sanitizedSlug]; exists {
				return "Ce lien personnalisé est déjà utilisé. Veuillez en choisir un autre.", ""
			}
		}
		return "", sanitizedSlug
	}

	return "", ""
}
