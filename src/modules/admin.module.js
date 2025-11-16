const { connect, reset, run } = require('../database/sqlite')
const { generateAccessCode, snakeToCamel } = require('../lib/utils')
const { signToken } = require('../lib/middleware')

// const { DuplicateResourceError, ResourceNotFoundError } = require('@shared/errors')


const ADMIN_CODE = "D3V"


const { Router } = require('express');

const routes = Router();


routes.get('/teams', async (req, res) => {
    console.debug('admin.teams');
    const db = await connect()
    const rows = await db.all(`
        SELECT
            t.id AS id,
            t.team_name,
            t.join_code,
            t.joined_at,
            t.finished_at,
            IFNULL(score.correct_count, 0) AS correct_count
        FROM teams t
        LEFT JOIN (
            SELECT
                a.team_id,
                SUM(
                    CASE
                        WHEN a.selected_option = e1.id AND e1.category = 'phishing' THEN 1
                        WHEN a.selected_option = e2.id AND e2.category = 'phishing' THEN 1
                        ELSE 0
                    END
                ) AS correct_count
            FROM attempts a
            JOIN email_pairs ep ON ep.id = a.pair_id
            JOIN emails e1 ON e1.id = ep.email_1
            JOIN emails e2 ON e2.id = ep.email_2
            GROUP BY a.team_id
        ) score ON score.team_id = t.id
        ORDER BY t.id;
    `)
    console.debug('admin.teams', rows);

    return res.status(200).json(snakeToCamel(rows));
});

routes.post('/reset', async (req, res) => {
    await reset()
    return res.status(200).json({
        success: true,
        message: 'Database successfully reset',
    });
});


routes.delete('/teams/:teamId', async (req, res) => {
    console.debug('params', req.params)
    const { teamId } = req.params
    console.info("deleting team", { teamId })
    await run('DELETE FROM teams WHERE id = ?', [teamId])
    console.info("deleted team", { teamId })
    return res.status(200).json();
});









module.exports = routes;
