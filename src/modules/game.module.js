const {
    getAttemptCount,
    getLatestAttempt,
    insertAttempt,
    get,
    run,
    all,
    getTeamResults
} = require('../database/sqlite')
const { snakeToCamel } = require('../lib/utils')

const { authMiddleware } = require('../lib/middleware');



const { Router } = require('express');

const routes = Router();



async function getRandomEmail(teamId) {
    return await get(`
        SELECT 
            e.id,
            e.subject,
            e.sent_from AS "from",
            e.sent_to AS "to",
            e.html
        FROM emails e
        WHERE NOT EXISTS (
            SELECT 1
            FROM attempts a
            WHERE a.email_id = e.id
            AND a.team_id = ?
        )
        ORDER BY RANDOM()
        LIMIT 1;
    `, [teamId])
}


async function newFun(teamId) {
    const { isFinished, count } = await isTeamDone(teamId)

    if (isFinished) {
        console.info('team is finished')

        return { done: true, message: "Team has completed all 50 attempts" };
    }

    console.info('team not finished')


    // 2. Try returning existing unresolved attempt
    console.info('getting latest attempt through refetch')
    const latest = await getLatestAttempt(teamId);
    // console.debug('latest', latest)


    if (latest && latest.selectedOption == null) {
        console.info('returning existing attempt', { attemptId: latest.attemptId, emailId: latest.email.id })
        return { done: false, count, attemptId: latest.attemptId, email: latest.email };
    }

    console.info('getting first random email')
    const randomEmail = await getRandomEmail(teamId);
    if (!randomEmail) {
        return { done: true, count, message: "All emails used" };
    }

    console.debug('first randomEmail', { id: randomEmail.id, subject: randomEmail.subject })


    // Insert it
    const attemptId = await insertAttempt(teamId, randomEmail.id);

    return {
        done: false,
        count,
        attemptId,
        email: randomEmail
    };

}





async function isTeamDone(teamId) {
    const { count } = await getAttemptCount(teamId);
    console.log(`[count]: ${count}`)
    if (count >= 40) {
        const team = await get('SELECT finished_at AS finishedAt FROM teams WHERE id = ?', [teamId])

        if (!team.finishedAt) {
            await run("UPDATE teams SET finished_at = datetime('now', 'localtime') WHERE id = ?", [teamId])
        }

        return { isFinished: true, count }

    }

    return { isFinished: false, count }

}



async function submitAttempt(
    teamId,
    currAttemptId,
    selectedOption,
) {
    // 1. Validate attempt exists & belongs to team
    const attempt = await get(
        `SELECT id, team_id, selected_option
         FROM attempts
         WHERE id = ?`,
        [currAttemptId]
    );

    if (!attempt) {
        console.warn("Attempt not found")
        return { error: true, message: "Attempt not found" };
    }

    if (attempt.team_id !== teamId) {
        console.warn("Attempt does not belong to this team")
        return { error: true, message: "Attempt does not belong to this team" };
    }

    // 2. Prevent double submission
    if (attempt.selected_option !== null) {
        console.warn("Attempt already submitted")

        return { error: true, message: "Attempt already submitted" };
    }

    // 3. Update attempt
    await run(
        `UPDATE attempts
         SET selected_option = ?
         WHERE id = ?`,
        [selectedOption, currAttemptId]
    );

    const { isFinished, count } = await isTeamDone(teamId)

    if (isFinished) {
        return { done: true, message: "Team has completed all 20 attempts" };

    }

    console.info('getting random email after attempt')
    const randomEmail = await getRandomEmail(teamId);

    console.debug('randomEmail after attempts', { id: randomEmail.id, subject: randomEmail.subject })
    if (!randomEmail) {
        return { done: true, count, message: "All emails used" };
    }

    const attemptId = await insertAttempt(teamId, randomEmail.id);

    return {
        done: false,
        count,
        attemptId,
        email: randomEmail
    };
}

routes.get('/attempt', authMiddleware, async (req, res, next) => {
    console.info('attempt.get')

    const { id } = req?.team
    const result = await newFun(id);
    // console.debug('attempt.get', result)
    console.log('\n\n')
    res.json(result);
});


routes.get('/results', authMiddleware, async (req, res, next) => {
    console.info('results.get')
    const { id } = req?.team

    const results = await getTeamResults(id)


    res.json(snakeToCamel(results));
});


routes.get('/leaderboard', authMiddleware, async (req, res, next) => {
    console.info('game.leaderboard')

    const rows = await all(`
        SELECT
            t.id AS id,
            t.team_name,
            t.joined_at,
            t.finished_at,
            IFNULL(score.correct_count, 0) AS correct_count
        FROM teams t
        LEFT JOIN (
            SELECT
                a.team_id,
                SUM(
                    CASE
                        WHEN a.selected_option = 'phishing' AND e.category = 'phishing' THEN 1
                        WHEN a.selected_option = 'legit' AND e.category = 'legit' THEN 1
                        ELSE 0
                    END
                ) AS correct_count
            FROM attempts a
            JOIN emails e ON e.id = a.email_id   -- 👈 moved inside
            GROUP BY a.team_id
        ) score ON score.team_id = t.id
        ORDER BY t.id;
    `)
    console.debug('game.leaderboard', rows);

    return res.status(200).json(snakeToCamel(rows));


    res.json(snakeToCamel(results));
});

routes.post("/attempt/:attemptId/submit", authMiddleware, async (req, res) => {
    const { id } = req?.team
    const attemptId = Number(req.params.attemptId);
    const { selection } = req.body;

    console.debug('attempt.submit', { id, attemptId, selection })


    const result = await submitAttempt(
        id,
        attemptId,
        selection,
    );
    console.log('\n\n')


    res.json(result);
});
// =============================
// EXPORT FOR ROUTES
// =============================
module.exports = routes