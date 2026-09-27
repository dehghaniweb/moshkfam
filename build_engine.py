import argparse
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


AGP_VERSION = "8.7.3"
GRADLE_VERSION = "8.11.1"
COMPILE_SDK = "35"
BUILD_TOOLS = "35.0.0"


def run(cmd, cwd=None, check=True):
    print("\n> " + " ".join(str(x) for x in cmd), flush=True)

    result = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True
    )

    if check and result.returncode != 0:
        raise RuntimeError(
            f"Command failed with exit code {result.returncode}"
        )

    return result.returncode


def safe_project_name(name):
    value = "".join(
        c if c.isalnum() else "_"
        for c in name
    )

    value = value.strip("_")

    if not value:
        value = "MyApp"

    if value[0].isdigit():
        value = "App_" + value

    return value


def application_id(project_name):
    clean = safe_project_name(project_name).lower()

    chars = []

    for c in clean:
        if c.isalnum() or c == "_":
            chars.append(c)

    clean = "".join(chars)

    if not clean:
        clean = "myapp"

    return f"com.{clean}.app"


def find_index(root):
    candidates = []

    for path in root.rglob("index.html"):
        parts_lower = [p.lower() for p in path.parts]

        if "build_input" in parts_lower:
            continue

        if "app" in parts_lower:
            continue

        candidates.append(path)

    if not candidates:
        raise RuntimeError(
            "index.html was not found inside the ZIP."
        )

    candidates.sort(key=lambda p: len(p.parts))

    return candidates[0]


def find_icon(index_parent):
    candidates = [
        index_parent / "icon" / "icon.png",
        index_parent / "Icon" / "icon.png",
        index_parent / "icons" / "icon.png",
        index_parent / "icon.png",
    ]

    for path in candidates:
        if path.exists():
            return path

    for path in index_parent.rglob("icon.png"):
        return path

    return None


def find_jks(index_parent):
    candidates = [
        p for p in index_parent.rglob("*")
        if p.is_file() and p.suffix.lower() in [".jks", ".keystore"]
    ]

    if not candidates:
        return None

    return candidates[0]


def write_file(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)

    path.write_text(
        content,
        encoding="utf-8"
    )


def create_android_project(
    android_dir,
    web_root,
    project_name,
    version_code,
    version_name
):
    app_id = application_id(project_name)

    settings_gradle = f"""
pluginManagement {{
    repositories {{
        google()
        mavenCentral()
        gradlePluginPortal()
    }}
}}

dependencyResolutionManagement {{
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {{
        google()
        mavenCentral()
    }}
}}

rootProject.name = "{project_name}"
include(":app")
""".strip()

    root_gradle = f"""
plugins {{
    id "com.android.application" version "{AGP_VERSION}" apply false
}}
""".strip()

    app_gradle = f"""
plugins {{
    id "com.android.application"
}}

android {{
    namespace "{app_id}"
    compileSdk {COMPILE_SDK}

    defaultConfig {{
        applicationId "{app_id}"
        minSdk 23
        targetSdk {COMPILE_SDK}
        versionCode {version_code}
        versionName "{version_name}"
    }}

    buildTypes {{
        debug {{
            minifyEnabled false
        }}

        release {{
            minifyEnabled false
            shrinkResources false
            debuggable false
        }}
    }}
}}
""".strip()

    manifest = f"""
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:label="{project_name}"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round">

        <activity
            android:name=".MainActivity"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

    </application>

</manifest>
""".strip()

    main_activity = f"""
package {app_id};

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {{

    @Override
    protected void onCreate(Bundle savedInstanceState) {{
        super.onCreate(savedInstanceState);

        WebView webView = new WebView(this);

        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);

        webView.setWebViewClient(new WebViewClient());

        webView.loadUrl("file:///android_asset/index.html");

        setContentView(webView);
    }}
}}
""".strip()

    styles = """
<?xml version="1.0" encoding="utf-8"?>
<resources>

    <style name="AppTheme"
        parent="android:style/Theme.Material.Light.NoActionBar">

        <item name="android:fontFamily">sans</item>
        <item name="android:windowActionModeOverlay">true</item>
        <item name="android:colorAccent">#2196F3</item>

    </style>

</resources>
""".strip()

    write_file(
        android_dir / "settings.gradle",
        settings_gradle
    )

    write_file(
        android_dir / "build.gradle",
        root_gradle
    )

    write_file(
        android_dir / "app" / "build.gradle",
        app_gradle
    )

    write_file(
        android_dir / "app" / "src" / "main" / "AndroidManifest.xml",
        manifest
    )

    write_file(
        android_dir / "app" / "src" / "main" / "java" /
        Path(*app_id.split(".")) / "MainActivity.java",
        main_activity
    )

    write_file(
        android_dir / "app" / "src" / "main" / "res" /
        "values" / "styles.xml",
        styles
    )

    assets = (
        android_dir /
        "app" /
        "src" /
        "main" /
        "assets"
    )

    assets.mkdir(parents=True, exist_ok=True)

    for item in web_root.iterdir():

        if item.name.lower() in [
            "app",
            "build",
            ".gradle"
        ]:
            continue

        destination = assets / item.name

        if item.is_dir():
            shutil.copytree(
                item,
                destination,
                dirs_exist_ok=True
            )
        else:
            shutil.copy2(
                item,
                destination
            )

    return app_id


def copy_icon(icon_path, android_dir):
    if not icon_path:
        print(
            "WARNING: icon.png not found. "
            "Android default icon will be used."
        )
        return

    res = android_dir / "app" / "src" / "main" / "res"

    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }

    # Pillow is intentionally optional.
    try:
        from PIL import Image
    except ImportError:
        print(
            "Pillow is not installed. "
            "Copying original icon.png."
        )

        for folder in sizes:
            d = res / folder
            d.mkdir(parents=True, exist_ok=True)

            shutil.copy2(
                icon_path,
                d / "ic_launcher.png"
            )

            shutil.copy2(
                icon_path,
                d / "ic_launcher_round.png"
            )

        return

    image = Image.open(icon_path).convert("RGBA")

    for folder, size in sizes.items():

        d = res / folder
        d.mkdir(parents=True, exist_ok=True)

        resized = image.resize(
            (size, size),
            Image.Resampling.LANCZOS
        )

        resized.save(
            d / "ic_launcher.png",
            "PNG"
        )

        resized.save(
            d / "ic_launcher_round.png",
            "PNG"
        )


def create_keystore(android_dir, project_name):
    keytool = shutil.which("keytool")

    if not keytool:
        raise RuntimeError(
            "keytool was not found."
        )

    password = os.environ.get(
        "KEYSTORE_PASSWORD"
    )

    if not password:
        raise RuntimeError(
            "KEYSTORE_PASSWORD GitHub Secret is missing."
        )

    jks = android_dir / f"{safe_project_name(project_name)}-release.jks"

    alias = safe_project_name(project_name).lower()

    run([
        keytool,
        "-genkeypair",
        "-v",
        "-keystore",
        str(jks),
        "-storepass",
        password,
        "-keypass",
        password,
        "-alias",
        alias,
        "-keyalg",
        "RSA",
        "-keysize",
        "2048",
        "-validity",
        "10000",
        "-dname",
        f"CN={project_name}, OU=Android, O=Android, L=Unknown, ST=Unknown, C=US"
    ])

    return jks, alias


def find_existing_alias(jks):
    keytool = shutil.which("keytool")

    password = os.environ.get(
        "KEYSTORE_PASSWORD"
    )

    if not password:
        raise RuntimeError(
            "KEYSTORE_PASSWORD GitHub Secret is missing."
        )

    result = subprocess.run(
        [
            keytool,
            "-list",
            "-v",
            "-keystore",
            str(jks),
            "-storepass",
            password
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT
    )

    if result.returncode != 0:
        raise RuntimeError(
            "Could not read existing JKS.\n" +
            result.stdout
        )

    for line in result.stdout.splitlines():

        if "Alias name:" in line:
            return line.split(":", 1)[1].strip()

    raise RuntimeError(
        "Could not find alias in JKS."
    )


def configure_signing(
    android_dir,
    jks,
    alias,
    password
):
    gradle_file = android_dir / "app" / "build.gradle"

    content = gradle_file.read_text(
        encoding="utf-8"
    )

    signing = f"""
    
    signingConfigs {{
        release {{
            storeFile file("{jks.as_posix()}")
            storePassword "{password}"
            keyAlias "{alias}"
            keyPassword "{password}"
        }}
    }}
""".rstrip()

    content = content.replace(
        "\n    buildTypes {",
        signing + "\n\n    buildTypes {"
    )

    content = content.replace(
        "release {\n            minifyEnabled false",
        "release {\n            signingConfig signingConfigs.release\n            minifyEnabled false"
    )

    gradle_file.write_text(
        content,
        encoding="utf-8"
    )


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--project-name",
        required=True
    )

    parser.add_argument(
        "--zip",
        required=True
    )

    parser.add_argument(
        "--version-code",
        required=True,
        type=int
    )

    parser.add_argument(
        "--version-name",
        default="1.0"
    )

    parser.add_argument(
        "--output",
        default="build_output"
    )

    args = parser.parse_args()

    project_name = args.project_name

    base = Path.cwd()

    zip_path = Path(args.zip).resolve()

    output = Path(args.output).resolve()

    work = base / "cloud_build"

    if work.exists():
        shutil.rmtree(work)

    if output.exists():
        shutil.rmtree(output)

    work.mkdir(
        parents=True,
        exist_ok=True
    )

    output.mkdir(
        parents=True,
        exist_ok=True
    )

    build_input = work / "input"

    build_input.mkdir(
        parents=True,
        exist_ok=True
    )

    print("==========================================")
    print("ANDROID BUILDER CLOUD ENGINE")
    print("==========================================")
    print("Project:", project_name)
    print("ZIP:", zip_path)
    print("Version Code:", args.version_code)
    print("Version Name:", args.version_name)
    print("==========================================")

    if not zip_path.exists():
        raise RuntimeError(
            f"ZIP file not found: {zip_path}"
        )

    print("\n[1/8] Extracting ZIP...")

    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(build_input)

    index = find_index(build_input)

    web_root = index.parent

    print("index.html:")
    print(index)

    print("\n[2/8] Searching project files...")

    icon = find_icon(web_root)

    if icon:
        print("Icon:", icon)
    else:
        print("Icon: NOT FOUND")

    existing_jks = find_jks(web_root)

    if existing_jks:
        print("JKS:", existing_jks)
    else:
        print("JKS: NOT FOUND")

    android_dir = (
        work /
        f"{safe_project_name(project_name)}_Android"
    )

    print("\n[3/8] Creating Android project...")

    app_id = create_android_project(
        android_dir,
        web_root,
        project_name,
        args.version_code,
        args.version_name
    )

    print("Application ID:", app_id)

    print("\n[4/8] Installing application icon...")

    copy_icon(
        icon,
        android_dir
    )

    password = os.environ.get(
        "KEYSTORE_PASSWORD"
    )

    if not password:
        raise RuntimeError(
            "KEYSTORE_PASSWORD GitHub Secret is required."
        )

    print("\n[5/8] Preparing signing key...")

    if existing_jks:

        destination_jks = (
            android_dir /
            f"{safe_project_name(project_name)}-release.jks"
        )

        shutil.copy2(
            existing_jks,
            destination_jks
        )

        alias = find_existing_alias(
            destination_jks
        )

        print("Using existing JKS.")
        print("Alias:", alias)

        jks = destination_jks

    else:

        print(
            "No JKS found in project. "
            "Creating new JKS."
        )

        jks, alias = create_keystore(
            android_dir,
            project_name
        )

    configure_signing(
        android_dir,
        jks,
        alias,
        password
    )

    gradlew = shutil.which("gradle")

    if not gradlew:
        raise RuntimeError(
            "Gradle executable was not found."
        )

    print("\n[6/8] Building Debug APK...")

    run(
        [
            gradlew,
            "--no-daemon",
            "assembleDebug"
        ],
        cwd=android_dir
    )

    print("\n[7/8] Building signed Release APK...")

    run(
        [
            gradlew,
            "--no-daemon",
            "assembleRelease"
        ],
        cwd=android_dir
    )

    print("\n[8/8] Building signed AAB...")

    run(
        [
            gradlew,
            "--no-daemon",
            "bundleRelease"
        ],
        cwd=android_dir
    )

    debug_apk = (
        android_dir /
        "app" /
        "build" /
        "outputs" /
        "apk" /
        "debug" /
        "app-debug.apk"
    )

    release_apk = (
        android_dir /
        "app" /
        "build" /
        "outputs" /
        "apk" /
        "release" /
        "app-release.apk"
    )

    release_aab = (
        android_dir /
        "app" /
        "build" /
        "outputs" /
        "bundle" /
        "release" /
        "app-release.aab"
    )

    if not debug_apk.exists():
        raise RuntimeError(
            "Debug APK was not created."
        )

    if not release_apk.exists():
        raise RuntimeError(
            "Release APK was not created."
        )

    if not release_aab.exists():
        raise RuntimeError(
            "Release AAB was not created."
        )

    project_safe = safe_project_name(
        project_name
    )

    shutil.copy2(
        debug_apk,
        output / f"{project_safe}-Debug.apk"
    )

    shutil.copy2(
        release_apk,
        output / f"{project_safe}-Signed.apk"
    )

    shutil.copy2(
        release_aab,
        output / f"{project_safe}-Signed.aab"
    )

    shutil.copy2(
        jks,
        output / f"{project_safe}-release.jks"
    )

    print("\n==========================================")
    print("BUILD SUCCESSFUL")
    print("==========================================")

    for file in sorted(output.iterdir()):
        print(
            f"{file.name} | {file.stat().st_size} bytes"
        )

    print("==========================================")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("\n==========================================")
        print("BUILD FAILED")
        print("==========================================")
        print(str(exc))
        print("==========================================")
        sys.exit(1)
