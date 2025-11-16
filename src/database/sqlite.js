const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const tables = require('./tables.json');
// const codeFiles = require('./code-files.json');
// const questions = require('./questions.json');
const legit = require('./legit.json')
const phishing = require('./phish.json')

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


    await db.run(`
INSERT INTO email_pairs (email_1, email_2)
SELECT
    CASE WHEN p.id < l.id THEN p.id ELSE l.id END AS email_1,
    CASE WHEN p.id < l.id THEN l.id ELSE p.id END AS email_2
FROM emails p
JOIN emails l
  ON p.category = 'phishing'
 AND l.category != 'phishing'
 AND p.id != l.id;

    `);


    console.info('table.seeded', { table: 'email_pairs', entries: legit.length * phishing.length });



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

// Get count of attempts
async function getTotalPairs(teamId) {
    return await get(
        `SELECT COUNT(*) AS count FROM email_pairs`,
        [teamId]
    );
}

async function getLatestAttempt(teamId) {
    return await get(
        `SELECT * FROM attempts
         WHERE team_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [teamId]
    );
}


async function getRandomPair(teamId) {
    return await get(
        `WITH used_emails AS (
            SELECT ep.email_1 AS email_id
            FROM attempts a
            JOIN email_pairs ep ON ep.id = a.pair_id
            WHERE a.team_id = ?
            UNION
            SELECT ep.email_2
            FROM attempts a
            JOIN email_pairs ep ON ep.id = a.pair_id
            WHERE a.team_id = ?
        )
        SELECT ep.id AS pair_id, ep.email_1, ep.email_2
        FROM email_pairs ep
        WHERE ep.email_1 NOT IN (SELECT email_id FROM used_emails)
          AND ep.email_2 NOT IN (SELECT email_id FROM used_emails)
        ORDER BY RANDOM()
        LIMIT 1`,
        [teamId, teamId]
    );
}



async function insertAttempt(teamId, pairId) {
    return await run(
        `INSERT INTO attempts (team_id, pair_id)
         VALUES (?, ?)`,
        [teamId, pairId]
    );
}

async function getAttemptWithEmails(attemptId) {
    const row = await get(
        `SELECT 
            a.id AS attempt_id,
            a.team_id,
            a.selected_option,
            a.reasoning,

            ep.id AS pair_id,

            e1.id AS email1_id,
            e1.category AS email1_category,
            e1.subject AS email1_subject,
            e1.sent_from AS email1_sent_from,
            e1.sent_to AS email1_sent_to,
            e1.date AS email1_date,
            e1.html AS email1_html,

            e2.id AS email2_id,
            e2.category AS email2_category,
            e2.subject AS email2_subject,
            e2.sent_from AS email2_sent_from,
            e2.sent_to AS email2_sent_to,
            e2.date AS email2_date,
            e2.html AS email2_html

        FROM attempts a
        JOIN email_pairs ep ON ep.id = a.pair_id
        JOIN emails e1 ON e1.id = ep.email_1
        JOIN emails e2 ON e2.id = ep.email_2
        WHERE a.id = ?`,
        [attemptId]
    );

    return {
        id: row.attempt_id,
        teamId: row.team_id,
        pairId: row.pair_id,
        selected_option: row.selected_option,
        reasoning: row.reasoning,
        email1: {
            id: row.email1_id,
            category: row.email1_category,
            subject: row.email1_subject,
            from: row.email1_sent_from,
            to: row.email1_sent_to,
            date: row.email1_date,
            html: row.email1_html
        },
        email2: {
            id: row.email2_id,
            category: row.email2_category,
            subject: row.email2_subject,
            from: row.email2_sent_from,
            to: row.email2_sent_to,
            date: row.email2_date,
            html: row.email2_html
        }
    };
}

async function getTeamResults(teamId) {
    const rows = await all(
        `SELECT 
            a.id AS attempt_id,
            a.team_id,
            a.selected_option,
            a.reasoning,

            ep.id AS pair_id,

            e1.id AS email1_id,
            e1.category AS email1_category,
            e1.subject AS email1_subject,
            e1.sent_from AS email1_sent_from,
            e1.sent_to AS email1_sent_to,
            e1.date AS email1_date,
            e1.html AS email1_html,

            e2.id AS email2_id,
            e2.category AS email2_category,
            e2.subject AS email2_subject,
            e2.sent_from AS email2_sent_from,
            e2.sent_to AS email2_sent_to,
            e2.date AS email2_date,
            e2.html AS email2_html,

            
    CASE
        WHEN a.selected_option = e1.id AND e1.category = 'phishing' THEN 1
        WHEN a.selected_option = e2.id AND e2.category = 'phishing' THEN 1
        ELSE 0
    END AS is_correct


        FROM attempts a
        JOIN email_pairs ep ON ep.id = a.pair_id
        JOIN emails e1 ON e1.id = ep.email_1
        JOIN emails e2 ON e2.id = ep.email_2
WHERE a.team_id = ?

`, [teamId]);


    return rows.map(row => ({
        id: row.attempt_id,
        teamId: row.team_id,
        pairId: row.pair_id,
        isCorrect: row.is_correct,
        selectedOption: row.selected_option,
        reasoning: row.reasoning,
        email1: {
            id: row.email1_id,
            category: row.email1_category,
        },
        email2: {
            id: row.email2_id,
            category: row.email2_category,
        }
    }))

}


module.exports = {
    connect,
    get,
    run,
    reset,
    getAttemptCount,
    getLatestAttempt,
    getRandomPair,
    insertAttempt,
    getAttemptWithEmails,
    getTotalPairs,
    getTeamResults,
};
