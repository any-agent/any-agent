import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
	writeWorkspaceFile,
	createWorkspace,
	getJobWorkDir,
} from "../../src/core/storage";
import { readFile, rm } from "fs/promises";
import path from "path";

describe("Storage - writeWorkspaceFile", () => {
	const testSessionId = "test-storage-session";
	const testJobId = "test-job";
	let workDir: string;

	beforeAll(async () => {
		// Create a test workspace
		workDir = await createWorkspace(testSessionId, testJobId);
	});

	afterAll(async () => {
		// Clean up test workspace
		try {
			await rm(getJobWorkDir(testSessionId, testJobId), {
				recursive: true,
				force: true,
			});
		} catch (err) {
			console.error("Error cleaning up test workspace:", err);
		}
	});

	describe("Text data", () => {
		test("writes simple text string correctly", async () => {
			const filename = "text-simple.txt";
			const content = "Hello, World!";

			await writeWorkspaceFile(workDir, filename, content);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath, "utf-8");

			expect(readContent).toBe(content);
		});

		test("writes multiline text string correctly", async () => {
			const filename = "text-multiline.txt";
			const content = `Line 1
Line 2
Line 3`;

			await writeWorkspaceFile(workDir, filename, content);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath, "utf-8");

			expect(readContent).toBe(content);
		});

		test("writes text with special characters correctly", async () => {
			const filename = "text-special.txt";
			const content = "Special chars: €, ñ, 中文, 🚀, \n\t\r";

			await writeWorkspaceFile(workDir, filename, content);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath, "utf-8");

			expect(readContent).toBe(content);
		});

		test("writes empty string correctly", async () => {
			const filename = "text-empty.txt";
			const content = "";

			await writeWorkspaceFile(workDir, filename, content);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath, "utf-8");

			expect(readContent).toBe("");
		});

		test("writes JSON text correctly", async () => {
			const filename = "data.json";
			const content = JSON.stringify({ test: true, value: 42 }, null, 2);

			await writeWorkspaceFile(workDir, filename, content);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath, "utf-8");

			expect(readContent).toBe(content);
			expect(JSON.parse(readContent)).toEqual({ test: true, value: 42 });
		});
	});

	describe("Binary data", () => {
		test("writes binary Buffer correctly", async () => {
			const filename = "binary-simple.bin";
			const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

			await writeWorkspaceFile(workDir, filename, binaryData);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath);

			expect(Buffer.isBuffer(readContent)).toBe(true);
			expect(readContent).toEqual(binaryData);
			expect(readContent.length).toBe(6);
			expect(readContent[0]).toBe(0x00);
			expect(readContent[5]).toBe(0xfd);
		});

		test("writes base64-decoded binary data correctly", async () => {
			const filename = "binary-base64.bin";
			// Create some binary data and encode it as base64
			const originalData = Buffer.from("This is binary data with special bytes: \x00\x01\x02\xff");
			const base64Data = originalData.toString("base64");

			// Decode and write
			const decodedBuffer = Buffer.from(base64Data, "base64");
			await writeWorkspaceFile(workDir, filename, decodedBuffer);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath);

			expect(readContent).toEqual(originalData);
			expect(readContent.toString()).toBe(originalData.toString());
		});

		test("writes PDF-like binary data correctly (simulated)", async () => {
			const filename = "test.pdf";
			// Simulate a PDF header and some binary content
			const pdfHeader = Buffer.from("%PDF-1.4\n");
			const binaryContent = Buffer.from([
				0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x00, 0xff, 0xee,
				0xdd, 0xcc,
			]);

			await writeWorkspaceFile(workDir, filename, binaryContent);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath);

			expect(readContent).toEqual(binaryContent);
			expect(readContent.length).toBe(binaryContent.length);
			// Verify it starts with PDF header bytes
			expect(readContent[0]).toBe(0x25); // %
			expect(readContent[1]).toBe(0x50); // P
			expect(readContent[2]).toBe(0x44); // D
			expect(readContent[3]).toBe(0x46); // F
		});

		test("preserves binary data integrity (no corruption)", async () => {
			const filename = "binary-integrity.bin";
			// Create a buffer with all possible byte values
			const allBytes = Buffer.alloc(256);
			for (let i = 0; i < 256; i++) {
				allBytes[i] = i;
			}

			await writeWorkspaceFile(workDir, filename, allBytes);

			// Read the file back and verify every byte
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath);

			expect(readContent.length).toBe(256);
			for (let i = 0; i < 256; i++) {
				expect(readContent[i]).toBe(i);
			}
		});

		test("writes image-like binary data correctly", async () => {
			const filename = "test-image.bin";
			// Simulate a small PNG header
			const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			const imageData = Buffer.concat([
				pngSignature,
				Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
			]);

			await writeWorkspaceFile(workDir, filename, imageData);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath);

			expect(readContent).toEqual(imageData);
			expect(readContent.length).toBe(imageData.length);
			// Verify PNG signature
			expect(readContent.subarray(0, 8)).toEqual(pngSignature);
		});

		test("writes large binary file correctly", async () => {
			const filename = "large-binary.bin";
			// Create a 1MB buffer with random-ish data
			const largeBuffer = Buffer.alloc(1024 * 1024);
			for (let i = 0; i < largeBuffer.length; i++) {
				largeBuffer[i] = i % 256;
			}

			await writeWorkspaceFile(workDir, filename, largeBuffer);

			// Read the file back and verify
			const filePath = path.join(workDir, filename);
			const readContent = await readFile(filePath);

			expect(readContent.length).toBe(largeBuffer.length);
			expect(readContent).toEqual(largeBuffer);
		});
	});

	describe("Mixed scenarios", () => {
		test("overwrites existing file with new content", async () => {
			const filename = "overwrite-test.txt";
			const firstContent = "First content";
			const secondContent = "Second content";

			// Write first time
			await writeWorkspaceFile(workDir, filename, firstContent);
			const filePath = path.join(workDir, filename);
			let readContent = await readFile(filePath, "utf-8");
			expect(readContent).toBe(firstContent);

			// Overwrite
			await writeWorkspaceFile(workDir, filename, secondContent);
			readContent = await readFile(filePath, "utf-8");
			expect(readContent).toBe(secondContent);
		});

		test("overwrites text with binary and vice versa", async () => {
			const filename = "mixed-overwrite.bin";

			// Write text first
			await writeWorkspaceFile(workDir, filename, "Text content");
			const filePath = path.join(workDir, filename);
			let readContent = await readFile(filePath, "utf-8");
			expect(readContent).toBe("Text content");

			// Overwrite with binary
			const binaryData = Buffer.from([0x00, 0xff, 0xaa, 0x55]);
			await writeWorkspaceFile(workDir, filename, binaryData);
			const binaryReadContent = await readFile(filePath);
			expect(binaryReadContent).toEqual(binaryData);

			// Overwrite with text again
			await writeWorkspaceFile(workDir, filename, "Back to text");
			readContent = await readFile(filePath, "utf-8");
			expect(readContent).toBe("Back to text");
		});
	});
});
