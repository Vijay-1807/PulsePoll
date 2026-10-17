# --- build stage ---
FROM golang:1.24-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/pulsepoll-api ./cmd/server

# --- runtime stage ---
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/pulsepoll-api /pulsepoll-api
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/pulsepoll-api"]
