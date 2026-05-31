# Stage 1: Compile the Go binary
FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

# Pre-fetch dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy codebase
COPY . .

# Build statically linked release binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o droplink-server main.go

# Stage 2: Minimal runner container
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/droplink-server .

# Copy public web assets
COPY --from=builder /app/public ./public

# Expose server port
EXPOSE 3000

# Start server
CMD ["./droplink-server"]
