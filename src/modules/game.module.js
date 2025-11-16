// const Database = require('better-sqlite3');
// const db = new Database('database.db');

const { getAttemptWithEmails, getAttemptCount, getLatestAttempt, getRandomPair, insertAttempt, get, run, getTotalPairs, connect, getTeamResults } = require('../database/sqlite')
// const { DuplicateResourceError, ResourceNotFoundError } = require('@shared/errors')
const { generateAccessCode, snakeToCamel } = require('../lib/utils')

const { authMiddleware } = require('../lib/middleware');



const { Router } = require('express');

const routes = Router();


async function getOrCreateAttemptForTeam(teamId) {


    // 1. Check if team is done
    // const { count } = await getAttemptCount(teamId);
    // console.log(`[count]: ${count}`)
    // if (count >= 20) {
    //     return { done: true, message: "Team has completed all 20 attempts" };
    // }

    const { isFinished, count } = await isTeamDone(teamId)

    if (isFinished) {
        return { done: true, message: "Team has completed all 20 attempts" };

    }

    // 2. Try returning existing unresolved attempt
    const latest = await getLatestAttempt(teamId);

    if (latest && latest.selected_option == null) {
        const full = await getAttemptWithEmails(latest.id);
        return { done: false, count, attempt: full };
    }

    // 3. Otherwise generate a new one
    const pair = await getRandomPair(teamId);

    if (!pair) {
        return { done: true, count, message: "No valid unused email pairs remain" };
    }

    // Insert it
    const created = await insertAttempt(teamId, pair.pair_id);

    // Fetch with full email objects
    const fullAttempt = await getAttemptWithEmails(created.lastID);

    return {
        done: false,
        count,
        attempt: fullAttempt
    };
}



async function isTeamDone(teamId) {
    const { count } = await getAttemptCount(teamId);
    console.log(`[count]: ${count}`)
    if (count >= 3) {
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
    attemptId,
    selected_option,
    reasoning
) {
    // 1. Validate attempt exists & belongs to team
    const attempt = await get(
        `SELECT id, team_id, selected_option
         FROM attempts
         WHERE id = ?`,
        [attemptId]
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
         SET selected_option = ?, reasoning = ?
         WHERE id = ?`,
        [selected_option, reasoning, attemptId]
    );

    // 4. Get updated full attempt
    const updated = await getAttemptWithEmails(attemptId);

    // 5. Determine if team is finished
    // const { count } = await getAttemptCount(teamId);

    // if (count >= 20) {
    //     return { error: false, updated, next: null, done: true };
    // }

    const { isFinished, count } = await isTeamDone(teamId)

    if (isFinished) {
        return { done: true, message: "Team has completed all 20 attempts" };

    }

    // 6. Try generating the next attempt
    const pair = await getRandomPair(teamId);

    if (!pair) {
        return { error: false, updated, next: null, done: true };
    }

    const created = await insertAttempt(teamId, pair.pair_id);
    const next = await getAttemptWithEmails(created.lastID);

    // 7. Return updated attempt + new attempt
    return {
        error: false,
        updated,
        next,
        done: false
    };
}

routes.get('/attempt', authMiddleware, async (req, res, next) => {
    console.info('attempt.get')

    const { id } = req?.team
    const result = await getOrCreateAttemptForTeam(id);
    // console.debug('attempt.get', result)
    res.json(result);
});


routes.get('/results', authMiddleware, async (req, res, next) => {
    console.info('results.get')
    const { id } = req?.team

    const results = await getTeamResults(id)


    res.json(snakeToCamel(results));
});

routes.post("/attempt/:attemptId/submit", authMiddleware, async (req, res) => {
    const { id } = req?.team
    const attemptId = Number(req.params.attemptId);
    const { selection, reasoning } = req.body;

    console.debug('attempt.submit', { id, attemptId, selection, reasoning })


    const result = await submitAttempt(
        id,
        attemptId,
        selection,
        reasoning
    );

    res.json(result);
});
// =============================
// EXPORT FOR ROUTES
// =============================
module.exports = routes