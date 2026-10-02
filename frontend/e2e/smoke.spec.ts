import { expect, test } from '@playwright/test'

// Runs against the Vite dev server with the in-browser mock API (VITE_USE_MOCK=true).
async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard')
}

test('redirects anonymous users to login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})

test('admin sees the dashboard KPIs', async ({ page }) => {
  await login(page, 'admin@school.edu', 'admin123')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByText("Today's attendance", { exact: true })).toBeVisible()
})

test('operator corrects attendance with a mandatory reason', async ({ page }) => {
  await login(page, 'operator@school.edu', 'operator123')
  await page.getByRole('complementary').getByRole('link', { name: 'Attendance' }).click()
  await page.getByRole('button', { name: /correct attendance for/i }).first().click()
  await page.getByRole('button', { name: 'Save correction' }).click()
  await expect(page.getByText('A reason is required')).toBeVisible()
  await page.getByLabel('Reason for adjustment').fill('Sensor failed after retries; confirmed by teacher')
  await page.getByRole('button', { name: 'Save correction' }).click()
  await expect(page.getByText('Corrected').first()).toBeVisible()
})

test('viewer cannot open audit logs', async ({ page }) => {
  await login(page, 'viewer@school.edu', 'viewer123')
  await page.goto('/audit') // full reload also proves the session survives a refresh
  await expect(page.getByText('Access denied')).toBeVisible()
})

test.describe('institutional attendance sheet', () => {
  test('renders header, benchmark row and highlights defaulters', async ({ page }) => {
    await login(page, 'operator@school.edu', 'operator123')
    await page.goto('/reports/sheet')
    await expect(page.getByText('Computer Science & Engineering')).toBeVisible()
    await expect(page.getByText('T.Y. B.Tech  Sem-I   (2026-27)')).toBeVisible()
    await expect(page.getByText('Attendance (29/6/2026 to 30/9/2026)')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Lect. Engaged' })).toBeVisible()
    const row7 = page.getByRole('row', { name: /BHOSALE SHWETA SHAILESH/ })
    await expect(row7.getByRole('cell').first()).toHaveClass(/fbd5b5/) // peach defaulter fill
    await expect(row7.locator('td.text-destructive').first()).toBeVisible()
    await expect(page.getByRole('cell', { name: 'T1', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'SEM-I' })).toBeVisible()
    await page.screenshot({ path: 'test-results/sheet.png', fullPage: false })
  })

  test('exports Excel with merged headers and PDF', async ({ page }) => {
    await login(page, 'viewer@school.edu', 'viewer123')
    await page.goto('/reports/sheet')
    await page.getByRole('cell', { name: 'Lect. Engaged' }).waitFor()

    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to Excel' }).click()])
    const xlsxPath = await xlsx.path()
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(xlsxPath)
    const ws = wb.worksheets[0]
    expect(ws.getCell('A1').value).toBe('Computer Science & Engineering')
    expect(ws.getCell('A3').value).toBe('Attendance (29/6/2026 to 30/9/2026)')
    expect([ws.getCell('A4').value, ws.getCell('B4').value]).toEqual(['T1', 'SEM-I'])
    expect(ws.getCell('C4').value).toBe('Theory')
    expect(ws.getCell('L4').value).toBe('Practical / Tutorial')
    expect(ws.getCell('A5').value).toBe('Roll No')
    expect(ws.getCell('B6').value).toBe('Lect. Engaged')
    expect(ws.getCell('A7').value).toBe(1)
    expect(ws.getCell('B7').value).toBe('BADAKE MRUDULA HANUMANT')
    expect(ws.getCell('A1').isMerged && ws.getCell('R1').isMerged).toBe(true)
    // ATTD. % headers are tall merged cells spanning both header rows
    expect(ws.getCell('K4').isMerged && ws.getCell('K5').isMerged).toBe(true)
    expect(ws.getCell('R4').isMerged && ws.getCell('R5').isMerged).toBe(true)
    const merges = Object.keys((ws as unknown as { _merges: Record<string, unknown> })._merges)
    expect(merges.length).toBeGreaterThan(5)

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to PDF' }).click()])
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)
    const fs = await import('node:fs')
    expect(fs.readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-')
  })

  test('viewer cannot queue warnings; operator can and repeat is deduplicated', async ({ page }) => {
    await login(page, 'viewer@school.edu', 'viewer123')
    await page.goto('/reports/sheet')
    await page.getByRole('cell', { name: 'Lect. Engaged' }).waitFor()
    await expect(page.getByRole('button', { name: /queue guardian warnings/i })).toHaveCount(0)
  })
})

test('operator queues guardian warnings once; a repeat is deduplicated', async ({ page }) => {
  await login(page, 'operator@school.edu', 'operator123')
  await page.goto('/reports/sheet')
  await page.getByRole('cell', { name: 'Lect. Engaged' }).waitFor()
  const btn = page.getByRole('button', { name: /queue guardian warnings/i })
  await btn.click()
  await expect(page.getByText(/warning\(s\) queued$/)).toBeVisible()
  await page.getByText(/warning\(s\) queued$/).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  await btn.click()
  await expect(page.getByText(/0 warning\(s\) queued, \d+ already sent this month/)).toBeVisible()
})
