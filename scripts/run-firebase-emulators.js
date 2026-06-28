const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const firebaseArgs = ["emulators:start", "--only", "functions,firestore,storage"];

const javaExecutableName = process.platform === "win32" ? "java.exe" : "java";

const javaExists = (javaHome) =>
  Boolean(javaHome) && fs.existsSync(path.join(javaHome, "bin", javaExecutableName));

const findWindowsAdoptiumJavaHome = () => {
  if (process.platform !== "win32") {
    return undefined;
  }

  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const adoptiumDir = path.join(programFiles, "Eclipse Adoptium");

  if (!fs.existsSync(adoptiumDir)) {
    return undefined;
  }

  return fs
    .readdirSync(adoptiumDir)
    .filter((entry) => {
      const match = /^jdk-(\d+)/.exec(entry);
      return match && Number(match[1]) >= 21;
    })
    .sort()
    .reverse()
    .map((entry) => path.join(adoptiumDir, entry))
    .find(javaExists);
};

const resolveJavaHome = () => {
  if (javaExists(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }

  return findWindowsAdoptiumJavaHome();
};

const getFirebaseCommand = () => {
  const localBinary = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "firebase.cmd" : "firebase",
  );

  return fs.existsSync(localBinary) ? localBinary : "firebase";
};

const spawnFirebase = (command, args, childEnv) => {
  if (process.platform !== "win32") {
    return spawn(command, args, {
      env: childEnv,
      shell: false,
      stdio: "inherit",
    });
  }

  return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command, ...args], {
    env: childEnv,
    shell: false,
    stdio: "inherit",
  });
};

const env = { ...process.env };
const javaHome = resolveJavaHome();

if (javaHome) {
  const javaBin = path.join(javaHome, "bin");
  env.JAVA_HOME = javaHome;
  env.Path = `${javaBin}${path.delimiter}${env.Path || env.PATH || ""}`;
  env.PATH = env.Path;
  console.log(`Using Java from ${javaHome}`);
} else {
  console.warn("Java 21+ was not found. Firebase emulators may fail to start.");
}

const child = spawnFirebase(getFirebaseCommand(), firebaseArgs, env);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
