// Ad-hoc sign the macOS app after electron-builder packs it but before it creates the DMG.
// Without any signature macOS shows "app is damaged"; ad-hoc signing changes that to
// "unidentified developer", which users can dismiss via System Settings → Privacy & Security.
const { execSync } = require('child_process')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`

  try {
    execSync(`codesign --sign - --force --deep "${appPath}"`, { stdio: 'pipe' })
    console.log(`  • ad-hoc signed  path=${appPath}`)
  } catch (err) {
    console.warn(`  ⚠ ad-hoc signing failed (app may show "damaged"): ${err.message}`)
  }
}
