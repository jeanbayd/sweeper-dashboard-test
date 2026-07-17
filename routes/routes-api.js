'use strict';

const express = require('express');
const router = express.Router();
const {
  listSweepersWithLatest, getSweeperDetail, getTeamStats, getTeamHourlySeries,
  getDaySummary, listKnownDays, getFullHistorySummary, getRanking, deleteSession,
  getTraceEventsForWindow,
} = require('../db');

// GET /api/sweepers?todayStart=... -> cartes profil (liste + dernière session + tendance + stats du jour)
// todayStart : ISO du début de journée en heure locale du navigateur (le front l'envoie).
router.get('/sweepers', (req, res) => {
  res.json(listSweepersWithLatest(req.query.todayStart));
});

// GET /api/sweepers/:login -> détail complet (historique, gaps, trace)
router.get('/sweepers/:login', (req, res) => {
  const detail = getSweeperDetail(req.params.login);
  if (!detail) return res.status(404).json({ error: 'Sweeper inconnu.' });
  res.json(detail);
});

// GET /api/team?start=...&end=... -> stats d'équipe façon comparator, sur une fenêtre
// + hourlySeries : activité horaire (pings FCR Lite) par login sur la même fenêtre,
//   pour la courbe de comparaison actions/h multi-sweepers.
router.get('/team', (req, res) => {
  const range = { start: req.query.start, end: req.query.end };
  const stats = getTeamStats(range);
  const hourlySeries = getTeamHourlySeries(range);
  res.json({ ...stats, hourlySeries });
});

// GET /api/sweepers/:login/day?dayStart=ISO&dayEnd=ISO -> résumé d'un jour précis
// (onglet "Jour" quand dayStart/dayEnd = aujourd'hui en heure locale, ou onglet
// "Date" pour un jour choisi dans le passé). Les bornes sont fournies par le
// front en ISO (heure locale du navigateur convertie), pas recalculées ici.
router.get('/sweepers/:login/day', (req, res) => {
  const { dayStart, dayEnd } = req.query;
  if (!dayStart || !dayEnd) return res.status(400).json({ error: 'dayStart et dayEnd sont requis.' });
  res.json(getDaySummary(req.params.login, dayStart, dayEnd));
});

// GET /api/sweepers/:login/days -> liste des jours (YYYY-MM-DD) où il y a des données,
// pour peupler le sélecteur de l'onglet "Date".
router.get('/sweepers/:login/days', (req, res) => {
  res.json(listKnownDays(req.params.login));
});

// GET /api/sweepers/:login/history -> agrégat complet depuis le premier jour connu
// + série quotidienne, pour l'onglet "Historique".
router.get('/sweepers/:login/history', (req, res) => {
  res.json(getFullHistorySummary(req.params.login));
});

// GET /api/sweepers/:login/trace-events?start=ISO&end=ISO -> détail des actions
// (façon FCR Trace Sweeper : asin/tote/station/occurrences) sur une fenêtre de
// temps. start/end optionnels (omis = pas de borne, utilisé par l'onglet "Globale").
router.get('/sweepers/:login/trace-events', (req, res) => {
  const { start, end } = req.query;
  res.json(getTraceEventsForWindow(req.params.login, start || null, end || null));
});

// GET /api/ranking?dayStart=ISO&dayEnd=ISO -> classement des sweepers sur la fenêtre donnée.
router.get('/ranking', (req, res) => {
  const { dayStart, dayEnd } = req.query;
  if (!dayStart || !dayEnd) return res.status(400).json({ error: 'dayStart et dayEnd sont requis.' });
  res.json(getRanking(dayStart, dayEnd));
});

// DELETE /api/sessions/:id -> nettoyage manuel (erreur de saisie, test, etc.)
router.delete('/sessions/:id', (req, res) => {
  const info = deleteSession(req.params.id);
  res.json({ ok: true, deleted: info.changes });
});

module.exports = router;
