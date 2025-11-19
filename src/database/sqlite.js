const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const tables = require('./tables.json');
// const codeFiles = require('./code-files.json');
// const questions = require('./questions.json');
const legit = require('./emails_legit.json')
const phishing = require('./emails_phishing.json')

const dbPath = path.resolve(__dirname, 'database.db');



let db;

/** 
 * 🔹 Connect or create DB 
 * @returns {Promise<import('sqlite').Database>}
 * */
async function connect() {
    if (db) return db; // reuse existing connection

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
    });

    // Enable foreign keys globally
    await db.exec('PRAGMA foreign_keys = ON;');

    console.info('database.connected');
    return db;
}




/** 🔹 Initialize schema */
async function init() {
    const db = await connect();


    for (const { name, query } of tables) {
        await db.exec(query);
        console.info('table.created', { tableName: name });
    }

    console.info('tables.created');
}




/** 🔹 Reset database */
async function clear() {
    console.warn('database.reseting');
    if (db) await db.close();

    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.warn('database.deleted');

    }

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
    });

    await db.exec('PRAGMA foreign_keys = ON;');
    console.info('database.created');

}



async function reset() {
    await clear()
    await init()
    // console.warn('skipping questions seed');

    await seed()
    console.info('database.reset');

}





function strip(code) {
    // Split into lines and remove leading/trailing blank lines
    const lines = code.replace(/^\n+|\n+$/g, '').split('\n');

    // Find the minimum indentation (ignore empty lines)
    const indents = lines
        .filter(line => line.trim())
        .map(line => line.match(/^[ \t]*/)[0].length);

    const minIndent = Math.min(...indents);

    // Remove the minimum indentation from each line
    return lines.map(line => line.slice(minIndent)).join('\n');
}

/** 🔹 Seed initial data */
async function seed() {
    const db = await connect();


    const stmt = await db.prepare(
        `INSERT INTO emails (category, subject, sent_from, sent_to, date, html)
     VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const le of legit) {
        await stmt.run("legit", le.subject, le.from, le.to, le.date, le.html);
    }

    await stmt.finalize();
    console.info('table.seeded', { table: 'emails', entries: legit.length, category: 'legit' });


    const stmt2 = await db.prepare(
        `INSERT INTO emails (category, subject, sent_from, sent_to, date, html)
     VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const pe of phishing) {
        await stmt2.run("phishing", pe.subject, pe.from, pe.to, pe.date, pe.html);
    }

    await stmt2.finalize();
    console.info('table.seeded', { table: 'emails', entries: legit.length, category: 'phishing' });



}

/** 🔹 Graceful shutdown */
process.on('SIGINT', async () => {
    if (db) await db.close();
    console.info('database.closed');
    process.exit(0);
});

async function all(sql, params = []) {
    const db = await connect();
    return db.all(sql, params);
}

async function get(sql, params = []) {
    const db = await connect();
    return db.get(sql, params);
}

async function run(sql, params = []) {
    const db = await connect();
    return db.run(sql, params);
}


// Get count of attempts
async function getAttemptCount(teamId) {
    return await get(
        `SELECT COUNT(*) AS count FROM attempts WHERE team_id = ? AND selected_option IS NOT NULL`,
        [teamId]
    );
}



async function getLatestAttempt(teamId) {
    const row = await get(`
        SELECT 
        a.id, 
        a.email_id AS emailId, 
        a.selected_option AS selectedOption,
        e.subject,
        e.sent_from AS "from",
        e.sent_to AS "to",
        e.html
        FROM attempts a
        JOIN emails e ON e.id = a.email_id
        WHERE a.team_id = ?
        ORDER BY a.id DESC
        LIMIT 1
    `, [teamId]);

    return !row ? null : {
        attemptId: row.id,
        selectedOption: row.selectedOption,
        email: {
            id: row.emailId,
            subject: row.subject,
            from: row.from,
            to: row.to,
            html: row.html
        }
    }
}






async function insertAttempt(teamId, emailId) {
    const { lastID } = await run(
        `INSERT INTO attempts (team_id, email_id)
         VALUES (?, ?)`,
        [teamId, emailId]
    );

    return lastID
}

async function getTeamResults(teamId) {
    const rows = await all(`
        SELECT 
            a.id AS attempt_id,
            a.team_id,
            a.selected_option,

            e.id AS emailId,
            e.category AS category,
            e.subject AS subject,
            e.sent_from AS "from",
            e.sent_to AS "to",
            e.html AS html,

        CASE
            WHEN a.selected_option = 'phishing' AND e.category = 'phishing' THEN 1
            WHEN a.selected_option = 'legit' AND e.category = 'legit' THEN 1
            ELSE 0
        END AS is_correct
            FROM attempts a
            JOIN emails e ON e.id = a.email_id
        WHERE a.team_id = ?

`, [teamId]);


    return rows.map(row => ({
        attemptId: row.attempt_id,
        teamId: row.team_id,
        emailId: row.emailId,
        correctAnswer: row.category,
        isCorrect: row.is_correct,
        selectedOption: row.selected_option,
    }))

}


module.exports = {
    connect,
    get,
    all,
    run,
    reset,
    getAttemptCount,
    getLatestAttempt,
    insertAttempt,
    getTeamResults,
};
