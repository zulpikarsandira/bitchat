// Package chatengine provides the core logic for the BitChat offline
// messaging application. It handles encryption, data integrity,
// and BLE packet fragmentation.
//
// All exported functions (starting with a capital letter) are designed
// to be bound by Gomobile and called from Android/React Native.
package chatengine

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// PacketTypeMessage indicates a standard chat message packet.
const PacketTypeMessage = "MESSAGE"

// PacketTypeFile indicates a binary file transfer packet.
const PacketTypeFile = "FILE"

// PacketTypeHandshake indicates a key-exchange / pairing handshake packet.
const PacketTypeHandshake = "HANDSHAKE"

// chunkSize defines the maximum bytes per BLE fragment (standard BLE MTU).
const chunkSize = 20

// ---------------------------------------------------------------------------
// Data Model
// ---------------------------------------------------------------------------

// Packet is the universal wrapper for all data transmitted over BLE.
// JSON tags ensure serialization is compact and readable.
type Packet struct {
	// Payload holds the AES-256-GCM encrypted message, encoded as base64.
	Payload string `json:"payload"`

	// Checksum is the SHA-256 hex digest of the original plaintext,
	// computed BEFORE encryption. Verified AFTER decryption.
	Checksum string `json:"checksum"`

	// Type classifies the packet: PacketTypeMessage, PacketTypeFile,
	// or PacketTypeHandshake.
	Type string `json:"type"`
}

// ---------------------------------------------------------------------------
// Key Derivation
// ---------------------------------------------------------------------------

// DeriveKey converts a human-readable shared secret into a 32-byte AES-256
// key using SHA-256.
//
// Exported so the key derivation step can be tested from Java/React Native.
func DeriveKey(secret string) []byte {
	hash := sha256.Sum256([]byte(secret))
	return hash[:]
}

// ---------------------------------------------------------------------------
// ECDH (Elliptic Curve Diffie-Hellman) Key Exchange
// ---------------------------------------------------------------------------

// KeyPair holds a Curve25519 private and public key pair as base64 strings.
type KeyPair struct {
	Private string `json:"private"`
	Public  string `json:"public"`
}

// GenerateKeyPair creates a new Curve25519 (X25519) key pair.
// Returns: JSON string of KeyPair struct, or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func GenerateKeyPair() string {
	curve := ecdh.X25519()
	private, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return "ERROR:failed to generate private key: " + err.Error()
	}

	public := private.PublicKey()

	kp := KeyPair{
		Private: base64.StdEncoding.EncodeToString(private.Bytes()),
		Public:  base64.StdEncoding.EncodeToString(public.Bytes()),
	}

	out, err := json.Marshal(kp)
	if err != nil {
		return "ERROR:json marshal failed: " + err.Error()
	}
	return string(out)
}

// ComputeSharedSecret derives a 32-byte shared secret from a local private key
// and a remote public key using X25519.
//
// Parameters:
//   - privateKeyB64    : local private key (from GenerateKeyPair)
//   - remotePublicKeyB64: public key received from peer
//
// Returns: base64-encoded shared secret (32 bytes), or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func ComputeSharedSecret(privateKeyB64, remotePublicKeyB64 string) string {
	curve := ecdh.X25519()

	// 1. Decode and parse local private key
	privBytes, err := base64.StdEncoding.DecodeString(privateKeyB64)
	if err != nil {
		return "ERROR:failed to decode private key: " + err.Error()
	}
	private, err := curve.NewPrivateKey(privBytes)
	if err != nil {
		return "ERROR:failed to parse private key: " + err.Error()
	}

	// 2. Decode and parse remote public key
	pubBytes, err := base64.StdEncoding.DecodeString(remotePublicKeyB64)
	if err != nil {
		return "ERROR:failed to decode remote public key: " + err.Error()
	}
	public, err := curve.NewPublicKey(pubBytes)
	if err != nil {
		return "ERROR:failed to parse remote public key: " + err.Error()
	}

	// 3. Compute shared secret
	secret, err := private.ECDH(public)
	if err != nil {
		return "ERROR:ecdh computation failed: " + err.Error()
	}

	return base64.StdEncoding.EncodeToString(secret)
}

// ---------------------------------------------------------------------------
// Encryption / Decryption
// ---------------------------------------------------------------------------

// Encrypt encrypts plaintext using AES-256-GCM with a key derived from
// secret. A fresh 12-byte nonce is generated for every call.
//
// Returns: base64(nonce + ciphertext), or an error string prefixed with
// "ERROR:" so the caller can detect failures without exception plumbing.
//
// Exported for Gomobile binding.
func Encrypt(plaintext, secret string) string {
	key := DeriveKey(secret)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "ERROR:" + err.Error()
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "ERROR:" + err.Error()
	}

	nonce := make([]byte, gcm.NonceSize()) // 12 bytes
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "ERROR:" + err.Error()
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext)
}

// Decrypt reverses Encrypt. It expects a base64-encoded string produced by
// Encrypt (nonce prepended to ciphertext).
//
// Returns the plaintext string, or "ERROR:<reason>" on failure.
//
// Exported for Gomobile binding.
func Decrypt(ciphertextB64, secret string) string {
	key := DeriveKey(secret)

	data, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return "ERROR:base64 decode failed: " + err.Error()
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "ERROR:" + err.Error()
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "ERROR:" + err.Error()
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "ERROR:ciphertext too short"
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "ERROR:decryption failed (wrong key or corrupted data): " + err.Error()
	}

	return string(plaintext)
}

// ---------------------------------------------------------------------------
// Checksum Helpers
// ---------------------------------------------------------------------------

// checksumOf computes a hex-encoded SHA-256 digest of data.
// Used internally when creating and verifying packets.
func checksumOf(data string) string {
	h := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", h)
}

// VerifyChecksum checks that the decrypted payload of a Packet matches
// the stored Checksum. Returns "OK" on success, or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func VerifyChecksum(packetJSON, secret string) string {
	var p Packet
	if err := json.Unmarshal([]byte(packetJSON), &p); err != nil {
		return "ERROR:invalid packet JSON: " + err.Error()
	}

	plaintext := Decrypt(p.Payload, secret)
	if strings.HasPrefix(plaintext, "ERROR:") {
		return plaintext
	}

	computed := checksumOf(plaintext)
	if computed != p.Checksum {
		return fmt.Sprintf("ERROR:checksum mismatch (got %s, want %s)", computed, p.Checksum)
	}
	return "OK"
}

// ---------------------------------------------------------------------------
// Packet Lifecycle
// ---------------------------------------------------------------------------

// CreatePacket builds an encrypted, integrity-stamped Packet and serialises
// it to a JSON string ready for BLE transmission.
//
// Parameters:
//   - plaintext  : the raw message to protect
//   - secret     : shared secret for key derivation
//   - packetType : one of PacketTypeMessage, PacketTypeFile, PacketTypeHandshake
//
// Returns: JSON string, or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func CreatePacket(plaintext, secret, packetType string) string {
	encrypted := Encrypt(plaintext, secret)
	if strings.HasPrefix(encrypted, "ERROR:") {
		return encrypted
	}

	p := Packet{
		Payload:  encrypted,
		Checksum: checksumOf(plaintext),
		Type:     packetType,
	}

	out, err := json.Marshal(p)
	if err != nil {
		return "ERROR:json marshal failed: " + err.Error()
	}
	return string(out)
}

// ParsePacket decrypts and validates a JSON Packet string produced by
// CreatePacket. It verifies the checksum and returns the plaintext message.
//
// Returns: the plaintext string, or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func ParsePacket(packetJSON, secret string) string {
	var p Packet
	if err := json.Unmarshal([]byte(packetJSON), &p); err != nil {
		return "ERROR:invalid packet JSON: " + err.Error()
	}

	plaintext := Decrypt(p.Payload, secret)
	if strings.HasPrefix(plaintext, "ERROR:") {
		return plaintext
	}

	computed := checksumOf(plaintext)
	if computed != p.Checksum {
		return "ERROR:data integrity check failed — packet may be corrupted or tampered"
	}

	return plaintext
}

// GetPacketType returns the Type field from a JSON Packet string without
// performing full decryption. Useful for routing decisions on the receiver.
//
// Returns: "MESSAGE", "FILE", "HANDSHAKE", or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func GetPacketType(packetJSON string) string {
	var p Packet
	if err := json.Unmarshal([]byte(packetJSON), &p); err != nil {
		return "ERROR:invalid packet JSON: " + err.Error()
	}
	return p.Type
}

// ---------------------------------------------------------------------------
// BLE Fragmentation
// ---------------------------------------------------------------------------

// SliceData breaks data into chunkSize-byte (20-byte) fragments suitable for
// BLE transmission and returns them as a JSON array string.
//
// Example:
//
//	SliceData("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
//	→ `["ABCDEFGHIJKLMNOPQRST","UVWXYZ"]`
//
// Returns: JSON array string, or "ERROR:<reason>".
//
// Exported for Gomobile binding.
// Note: Gomobile does not support []string return types; JSON string is used
// instead so both Java and JavaScript can parse it easily.
func SliceData(data string) string {
	if data == "" {
		return "[]"
	}

	bytes := []byte(data)
	var chunks []string

	for i := 0; i < len(bytes); i += chunkSize {
		end := i + chunkSize
		if end > len(bytes) {
			end = len(bytes)
		}
		chunks = append(chunks, string(bytes[i:end]))
	}

	out, err := json.Marshal(chunks)
	if err != nil {
		return "ERROR:json marshal failed: " + err.Error()
	}
	return string(out)
}

// ReassembleData reconstructs the original data from a JSON array of chunk
// strings produced by SliceData.
//
// Returns: the reassembled string, or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func ReassembleData(chunksJSON string) string {
	if chunksJSON == "" || chunksJSON == "[]" {
		return ""
	}

	var chunks []string
	if err := json.Unmarshal([]byte(chunksJSON), &chunks); err != nil {
		return "ERROR:invalid chunks JSON: " + err.Error()
	}

	// Validate no individual chunk exceeds the MTU (defensive check)
	for i, c := range chunks {
		if len([]byte(c)) > chunkSize {
			return fmt.Sprintf("ERROR:chunk[%d] exceeds %d bytes (%d bytes)", i, chunkSize, len([]byte(c)))
		}
	}

	return strings.Join(chunks, "")
}

// SliceAndEncryptPacket is a convenience helper that combines CreatePacket
// and SliceData into a single call. It encrypts the plaintext, wraps it in
// a Packet, serialises to JSON, and then slices the JSON for BLE transport.
//
// Returns: JSON array of chunk strings, or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func SliceAndEncryptPacket(plaintext, secret, packetType string) string {
	packetJSON := CreatePacket(plaintext, secret, packetType)
	if strings.HasPrefix(packetJSON, "ERROR:") {
		return packetJSON
	}
	return SliceData(packetJSON)
}

// ReassembleAndDecryptPacket is the inverse of SliceAndEncryptPacket. It
// reassembles BLE chunks into a JSON Packet, then decrypts and validates it.
//
// Returns: the plaintext string, or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func ReassembleAndDecryptPacket(chunksJSON, secret string) string {
	packetJSON := ReassembleData(chunksJSON)
	if strings.HasPrefix(packetJSON, "ERROR:") {
		return packetJSON
	}
	return ParsePacket(packetJSON, secret)
}

// ---------------------------------------------------------------------------
// Local Storage (JSON Based)
// ---------------------------------------------------------------------------

// Message represents a single chat record in the local history.
type Message struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	Sender    string `json:"sender"` // "me" or "them"
	Timestamp int64  `json:"timestamp"`
}

// StoreMessage appends a message to a local JSON file.
//
// Parameters:
//   - filePath: absolute path to the storage file (e.g. from Context.getFilesDir())
//   - text    : plaintext message content
//   - sender  : "me" or "them"
//
// Returns: "OK" or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func StoreMessage(filePath, text, sender string) string {
	var messages []Message

	// 1. Read existing messages if file exists
	if _, err := os.Stat(filePath); err == nil {
		data, err := os.ReadFile(filePath)
		if err == nil {
			json.Unmarshal(data, &messages)
		}
	}

	// 2. Append new message
	msg := Message{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Text:      text,
		Sender:    sender,
		Timestamp: time.Now().Unix(),
	}
	messages = append(messages, msg)

	// 3. Save back to file
	out, err := json.MarshalIndent(messages, "", "  ")
	if err != nil {
		return "ERROR:failed to marshal messages: " + err.Error()
	}

	err = os.WriteFile(filePath, out, 0644)
	if err != nil {
		return "ERROR:failed to write file: " + err.Error()
	}

	return "OK"
}

// GetHistory reads the local message history and returns it as a JSON array string.
//
// Returns: JSON array string, or "[]" if no history exists.
//
// Exported for Gomobile binding.
func GetHistory(filePath string) string {
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return "[]"
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return "ERROR:failed to read history file: " + err.Error()
	}

	return string(data)
}

// ClearHistory deletes the local message history file.
//
// Returns: "OK" or "ERROR:<reason>".
//
// Exported for Gomobile binding.
func ClearHistory(filePath string) string {
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return "OK"
	}

	err := os.Remove(filePath)
	if err != nil {
		return "ERROR:failed to delete history: " + err.Error()
	}

	return "OK"
}

// Version returns the current version of the chatengine library.
// Useful for debugging compatibility between the AAR and the JS layer.
//
// Exported for Gomobile binding.
func Version() string {
	return "chatengine/1.0.0-phase1"
}

// validateError is an internal helper to check if a result string signals
// an error (used in tests and internally).
func validateError(result string) error {
	if strings.HasPrefix(result, "ERROR:") {
		return errors.New(result)
	}
	return nil
}
