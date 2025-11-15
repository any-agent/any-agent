import path from "path";
import os from "node:os";
import process from "node:process";
import { mkdir, chmod, readdir, stat, chown } from "fs/promises";

/**
 * Get the base storage directory path
 * Uses AA_STORAGE_PATH environment variable if set, otherwise defaults to ~/.aa-storage
 *
 * In containerized deployments, AA_STORAGE_PATH should be set to a path that exists
 * on the host and mounted at the same path in the container. This ensures the Docker
 * daemon can mount workspace directories into worker containers.
 *
 * Platform-specific paths:
 * - Mac: /Users/yourname/aa-storage (NOT /tmp - VirtioFS has SELinux issues)
 * - Linux: /var/lib/aa-storage or $HOME/.local/share/aa-storage
 */
export function getBaseStorageDir(): string {
	return process.env.AA_STORAGE_PATH || path.join(os.homedir(), ".aa-storage");
}

/**
 * Get the session directory path
 */
export function getSessionDir(sessionId: string): string {
	return path.join(getBaseStorageDir(), sessionId);
}

/**
 * Get the job workspace directory path
 */
export function getJobWorkDir(sessionId: string, jobId: string): string {
	return path.join(getSessionDir(sessionId), `job-${jobId}`);
}

/**
 * Get the uid/gid of the storage directory owner
 * This is used to ensure files created by root match the ownership of the storage directory
 */
async function getStorageOwner(): Promise<{ uid: number; gid: number } | null> {
	try {
		const baseDir = getBaseStorageDir();
		// Create base directory if it doesn't exist
		await mkdir(baseDir, { recursive: true });
		const stats = await stat(baseDir);
		return { uid: stats.uid, gid: stats.gid };
	} catch (err) {
		console.error("Error getting storage directory owner:", err);
		return null;
	}
}

/**
 * Chown a file or directory to match the storage directory owner
 * Only performs chown if running as root (uid 0)
 */
async function chownToStorageOwner(targetPath: string): Promise<void> {
	// Only chown if running as root
	if (process.getuid && process.getuid() !== 0) {
		return;
	}

	const owner = await getStorageOwner();
	if (owner) {
		try {
			await chown(targetPath, owner.uid, owner.gid);
		} catch (err) {
			console.error(`Error chowning ${targetPath}:`, err);
		}
	}
}

/**
 * Create a workspace directory for a job
 */
export async function createWorkspace(sessionId: string, jobId: string): Promise<string> {
	const sessionDir = getSessionDir(sessionId);
	const workDir = getJobWorkDir(sessionId, jobId);

	// Create directories
	await mkdir(workDir, { recursive: true });
	await chmod(workDir, 0o755);

	// Chown session and job directories to match storage owner (if running as root)
	await chownToStorageOwner(sessionDir);
	await chownToStorageOwner(workDir);

	return workDir;
}

/**
 * Write a file to the workspace
 */
export async function writeWorkspaceFile(
	workDir: string,
	filename: string,
	content: string | Buffer
): Promise<string> {
	const filePath = path.join(workDir, filename);
  const file = Bun.file(filePath);
  await Bun.write(file, content);

	// Chown file to match storage owner (if running as root)
	await chownToStorageOwner(filePath);

	return filePath;
}

/**
 * List all files in a workspace directory
 */
export async function listWorkspaceFiles(workDir: string): Promise<string[]> {
	try {
		return await readdir(workDir);
	} catch (err) {
		console.error("Error reading workspace directory:", err);
		return [];
	}
}

/**
 * Get the artifact file path
 */
export function getArtifactPath(sessionId: string, jobId: string, filename: string): string {
	return path.join(getJobWorkDir(sessionId, jobId), filename);
}

/**
 * Generate artifact URL
 */
export function generateArtifactUrl(
	protocol: string,
	host: string,
	sessionId: string,
	jobId: string,
	filename: string
): string {
	return `${protocol}://${host}/artifacts/${sessionId}/${jobId}/${filename}`;
}

/**
 * Separate files into input and output artifacts with URLs
 */
export function categorizeArtifacts(
	files: string[],
	inputFiles: Set<string>,
	protocol: string,
	host: string,
	sessionId: string,
	jobId: string
): {
	inputs: Record<string, string>;
	outputs: Record<string, string>;
} {
	const inputs: Record<string, string> = {};
	const outputs: Record<string, string> = {};

	for (const file of files) {
		const url = generateArtifactUrl(protocol, host, sessionId, jobId, file);
		if (inputFiles.has(file)) {
			inputs[file] = url;
		} else {
			outputs[file] = url;
		}
	}

	return { inputs, outputs };
}
