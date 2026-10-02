# Phase 1 rollback-artifact blocker analysis

## Decision

No previous known-good firmware binary or full-flash backup exists in the current repository.

The repository was searched recursively, including hidden and ignored files, for `.bin`, `.hex`, `.elf`, `.img`, `.uf2`, backup, archive, and rollback/known-good naming patterns. The only firmware binary found was:

```text
D:\IoT\build\phase1\Attendance.ino.bin
```

That file is the Phase 1 compile-verification artifact with placeholder configuration. It is not the previous firmware and must not be used as rollback evidence. The accompanying ELF is from the same Phase 1 build. The repository therefore does **not** satisfy the rollback gate.

## Safest rollback artifact

The safest available artifact is a byte-for-byte read of the entire 4 MB SPI flash from the currently working ESP8266 before any Phase 1 upload. A whole-flash image is preferable to extracting only the application region because it preserves, for the same device and flash layout:

- Bootloader/application image and firmware configuration embedded in it
- LittleFS contents, including `/students.txt`
- Existing SDK/Wi-Fi parameter sectors
- Other flash-resident state across the configured 4 MB layout

Reading flash does not erase or overwrite flash. However, esptool must reset the ESP into its ROM serial bootloader. Its normal high-speed read path uploads a temporary flasher stub into volatile RAM only; it does not write the SPI flash. The device is unavailable as an attendance terminal during the read and is hard-reset back into its installed firmware afterward.

The backup should be treated as a high-sensitivity secret artifact because it can contain Wi-Fi credentials, the Apps Script URL/shared key, phone numbers, student records, and attendance/outbox data. Store it outside the Git repository in restricted, preferably encrypted storage. Never attach it to chat, commit it, or publish its hashes alongside private identifying metadata unless authorized.

## Installed read tool

This machine already contains the tooling bundled with ESP8266 Arduino core 3.1.2:

| Tool | Value |
| --- | --- |
| esptool | 3.0 |
| Python | ESP8266 package Python 3.7.2-post1 |
| esptool script | `C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\esptool\esptool.py` |
| pyserial bundle | `C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\pyserial` |

No package installation or Internet access is required. The Arduino `upload.py` wrapper must **not** be used for backup: it always constructs a `write_flash` command. The commands below invoke esptool directly.

## Required manual approval

Explicit manual approval is required before connecting to the board or executing any command containing `--port`. Even though the planned operations are read-only, they reset the live terminal, temporarily interrupt service, and load a volatile RAM stub.

Before approval, confirm:

1. The device is the currently working attendance ESP8266.
2. No attendance transaction or local write is in progress.
3. Stable USB power and a known data-capable cable are available.
4. Arduino Serial Monitor and every other COM-port user are closed.
5. The correct COM port has been identified by disconnect/reconnect comparison.
6. A protected destination outside `D:\IoT` has been selected with at least 12 MB free.
7. The operator accepts a brief reboot/service interruption.

## Exact read-only procedure — do not execute automatically

The examples use `COM7` only as a placeholder. Replace it after manually identifying the actual port. Do not copy the example unchanged.

### 1. Identify the port without opening it

```powershell
& 'C:\Users\400ku\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe' board list
```

Run once disconnected and once connected. The new port is the candidate. If more than one port changes or board identity is uncertain, stop.

### 2. Create protected storage outside the repository

Use an operator-controlled location such as:

```powershell
New-Item -ItemType Directory -Path 'D:\IoT-private-backups\current-known-good-2026-09-19'
```

Restrict access or place this directory inside an approved encrypted volume. Do not create the backup under `D:\IoT`.

### 3. Read identity and flash manufacturer/size evidence

Use the following command form, substituting the approved port for `COM7`:

```powershell
& 'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\tools\python3\3.7.2-post1\python3.exe' -c "import sys; sys.path.insert(0, r'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\pyserial'); sys.path.insert(0, r'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\esptool'); import esptool; esptool.main()" --chip esp8266 --port COM7 --baud 115200 --before default_reset --after hard_reset flash_id
```

Record the chip type, crystal, MAC/chip identity, flash manufacturer/device ID, and detected flash size. Do not post the complete MAC publicly. If detected flash size is not 4 MB, stop and revise the read length before proceeding.

`flash_id` reads identity registers. It does not erase or program flash. The default esptool connection may load its helper into RAM and resets the board afterward.

### 4. Perform two independent full-flash reads

Only after `flash_id` confirms 4 MB:

```powershell
& 'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\tools\python3\3.7.2-post1\python3.exe' -c "import sys; sys.path.insert(0, r'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\pyserial'); sys.path.insert(0, r'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\esptool'); import esptool; esptool.main()" --chip esp8266 --port COM7 --baud 115200 --before default_reset --after no_reset read_flash 0x000000 0x400000 'D:\IoT-private-backups\current-known-good-2026-09-19\esp8266-full-read-1.bin'
```

```powershell
& 'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\tools\python3\3.7.2-post1\python3.exe' -c "import sys; sys.path.insert(0, r'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\pyserial'); sys.path.insert(0, r'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\esptool'); import esptool; esptool.main()" --chip esp8266 --port COM7 --baud 115200 --before default_reset --after hard_reset read_flash 0x000000 0x400000 'D:\IoT-private-backups\current-known-good-2026-09-19\esp8266-full-read-2.bin'
```

The requested range is address `0x000000` through `0x3FFFFF`, exactly 4,194,304 bytes. The first read deliberately leaves the board in bootloader mode; the second independently reconnects and performs the same read, then hard-resets into the installed application. This prevents normal application/SDK writes between the two snapshots. Two reads are required so serial-transfer corruption can be detected without writing anything back.

If automatic bootloader entry fails, stop. Do not improvise wiring changes. A NodeMCU can normally use USB auto-reset; a manual FLASH/BOOT plus RESET sequence may be used only by an operator who has identified the exact board controls. This changes boot mode temporarily but does not erase flash.

### 5. Verify size and hashes

```powershell
Get-Item 'D:\IoT-private-backups\current-known-good-2026-09-19\esp8266-full-read-1.bin','D:\IoT-private-backups\current-known-good-2026-09-19\esp8266-full-read-2.bin' | Select-Object FullName,Length,LastWriteTime
```

Both lengths must be exactly `4194304`.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\IoT-private-backups\current-known-good-2026-09-19\esp8266-full-read-1.bin','D:\IoT-private-backups\current-known-good-2026-09-19\esp8266-full-read-2.bin'
```

Both SHA-256 values must match exactly. If they differ, neither copy is verified; stop, stabilize power/cable/baud, and investigate without uploading or erasing.

Optionally compare every byte:

```powershell
& 'C:\Windows\System32\fc.exe' /b 'D:\IoT-private-backups\current-known-good-2026-09-19\esp8266-full-read-1.bin' 'D:\IoT-private-backups\current-known-good-2026-09-19\esp8266-full-read-2.bin'
```

Expected result: `FC: no differences encountered`.

### 6. Verify the device resumed its current firmware

After the second command hard-resets the board, open Serial Monitor at 115200 baud. Confirm normal boot, fingerprint sensor detection, expected template count, local student count, LCD idle display, and Wi-Fi connection. Do not create an attendance event merely to test the backup unless separately approved.

At this point retain one image as the rollback master and one as an independent verification copy. Record the matching hash, size, read date, esptool/core versions, detected flash size, device identifier in redacted form, and storage location in a non-secret inventory record. Do not move the image into Git.

## Can the full-flash backup be restored?

Yes, a consistent 4 MB full-flash image is technically restorable to the same ESP8266 module and same flash geometry by writing it from address `0x000000`. It is stronger rollback material than an application-only `.bin` because it also restores LittleFS and SDK parameter sectors as captured.

The eventual restore operation is destructive to the then-current flash and must receive separate explicit approval. The command is documented for feasibility only and must not be run during backup:

```powershell
# DO NOT RUN DURING BACKUP. THIS WRITES/OVERWRITES THE DEVICE FLASH.
& 'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\tools\python3\3.7.2-post1\python3.exe' -c "import sys; sys.path.insert(0, r'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\pyserial'); sys.path.insert(0, r'C:\Users\400ku\AppData\Local\Arduino15\packages\esp8266\hardware\esp8266\3.1.2\tools\esptool'); import esptool; esptool.main()" --chip esp8266 --port COM7 --baud 115200 --before default_reset --after hard_reset write_flash --flash_size 4MB 0x000000 'D:\IoT-private-backups\current-known-good-2026-09-19\esp8266-full-read-1.bin'
```

Restoration should target the original device. Restoring a full image to another ESP8266 can copy credentials and device-specific SDK/RF state and will not reproduce immutable chip identity. Cross-device restoration therefore needs a separate recovery design.

## Limitations and risks

- **Brief downtime/reset:** backup requires bootloader mode and resets the working terminal. Volatile runtime state is lost, although flash state is preserved.
- **In-flight writes:** resetting during a LittleFS write could leave data inconsistent. Perform backup only while idle and stable.
- **Sensitive contents:** the image is effectively a secret/data dump and must be access-controlled.
- **Flash-size assumption:** `0x400000` is valid only after the physical chip reports 4 MB.
- **Read consistency:** changing SDK counters or filesystem data between two reads can cause different hashes. Keep the device isolated/idle; each read ends with a reboot. If hashes differ, investigate rather than declaring success.
- **Hardware/USB risk:** unstable power, cable failure, or serial contention can interrupt reads. Interrupted reads do not intentionally change flash, but the board may remain in bootloader mode until reset.
- **RAM stub:** default esptool temporarily loads code into RAM. It is lost on reset and does not overwrite flash, but it is still a temporary execution-state change.
- **No source reconstruction:** a flash image is a rollback artifact, not maintainable source code. It does not recover the original sketch in editable form.
- **Restore is not yet proven:** matching double-read hashes establish backup consistency, not a tested restore. A destructive restore test on the working device would defeat the safety goal; restoration remains a documented emergency procedure.
- **Same-device preference:** a whole-flash image is safest when restored to the exact original module and flash chip.

## Blocker status

Cleared on 2026-09-20. Two independent full-flash images were assembled from separately read 512 KB chunks and verified outside Git:

- Run 1: 4,194,304 bytes
- Run 2: 4,194,304 bytes
- Both SHA-256: `F05436390348437F90723F0EC0D7F1395417EEEA1E698099972E7FEE655FB0BE`
- Host byte comparison: identical

The protected images remain under `D:\IoT-private-backups\current-known-good-2026-09-19\run-1\` and `run-2\`. They contain sensitive firmware/configuration and student data and must remain outside Git. Restoration remains a separately approved destructive operation.
