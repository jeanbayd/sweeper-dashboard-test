/* =========================================================================
 *  PATCH — FCR Lite Ultra V4 (SWEEP)
 *  But : l'extraction manuelle (bouton 🔎, "loupe") doit ÉCRASER les
 *  données du jour côté dashboard au lieu de s'accumuler par-dessus les
 *  pings auto / extractions précédentes.
 *
 *  1 seule fonction à remplacer : fcrActBackfillDay. Elle envoyait avant un
 *  POST /api/ingest/activity PAR créneau horaire (boucle sur fcrActPushOneSlot).
 *  Elle envoie maintenant TOUS les créneaux en UN SEUL appel vers la nouvelle
 *  route /api/ingest/activity-day, qui supprime puis réinsère (transaction
 *  atomique côté serveur) toute l'activité du login sur la journée avant
 *  d'insérer les nouveaux créneaux — donc écrasement propre, y compris des
 *  pings auto déjà reçus pour ce jour-là.
 *
 *  fcrActPushOneSlot() reste utilisée telle quelle par le heartbeat normal
 *  (fcrActivitySendHourly) — on n'y touche pas.
 * ========================================================================= */

/* -------------------------------------------------------------------------
 * 1) Ajouter cette nouvelle fonction juste après fcrActPushOneSlot()
 *    (ligne ~649, juste avant `async function fcrActBackfillDay(...)`)
 * ---------------------------------------------------------------------- */
function fcrActPushDayBatch(login, dayStart, dayEnd, slots, log) {
    return new Promise((resolve) => {
        const { url, key } = fcrActGetConfig();
        if (!url || !key) { log && log('⚠️ Backend non configuré (bouton 📡).'); return resolve(false); }
        const payload = {
            login,
            dayStart: dayStart.toISOString(),
            dayEnd: dayEnd.toISOString(),
            slots: slots.map(s => ({
                periodStart: s.periodStart.toISOString(),
                periodEnd: s.periodEnd.toISOString(),
                actionsCount: s.actionsCount,
                impressionsCount: 0, // non reconstituable a posteriori (idem ancienne version)
                idleGaps: s.idleGaps.map(g => ({ from: g.from, to: g.to, durationMin: g.durationMin })),
            })),
        };
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${url}/api/ingest/activity-day`,
            headers: { 'Content-Type': 'application/json', 'x-api-key': key },
            data: JSON.stringify(payload),
            timeout: 30000,
            onload: (res) => {
                if (res.status >= 200 && res.status < 300) {
                    log && log(`✅ Journée envoyée — anciennes données de ce jour écrasées, ${slots.length} créneau(x) réinséré(s).`);
                    resolve(true);
                } else {
                    log && log(`❌ Échec envoi journée (${res.status}).`);
                    resolve(false);
                }
            },
            onerror: () => { log && log('❌ erreur réseau lors de l\'envoi de la journée'); resolve(false); },
            ontimeout: () => { log && log('❌ timeout lors de l\'envoi de la journée'); resolve(false); },
        });
    });
}

/* -------------------------------------------------------------------------
 * 2) Remplacer ENTIÈREMENT le corps de fcrActBackfillDay par celui-ci
 *    (même signature, mêmes appels de scraping — seule la partie envoi change)
 * ---------------------------------------------------------------------- */
async function fcrActBackfillDay(login, dateISO, log) {
    if (!FCR_ACT_HOST_OK) {
        log && log('⚠️ Cette page n\'est pas sur fcresearch-eu.aka.amazon.com ni sur qifcr.eu.aftx.amazonoperations.app — impossible de scraper (même origine requise).');
        return;
    }
    const { dayStart, dayEnd } = fcrActBackfillDayBounds(dateISO);
    const range = {
        startDate: dayStart, endDate: dayEnd,
        startDateISO: fcrActDateOnlyIso(dayStart), endDateISO: fcrActDateOnlyIso(dayEnd),
    };
    log && log(`⏳ Chargement des mouvements de ${login} pour le ${dateISO}...`);
    const invRows = await fcrActGetInventoryRowsForLogin(login, range, log);
    const sorted = invRows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Même vide, on envoie quand même le batch (avec un tableau de créneaux
    // vide) pour que la journée soit remise à zéro côté dashboard si un
    // login n'a en réalité rien fait ce jour-là — sinon d'anciens pings auto
    // resteraient affichés à tort.
    const gaps = sorted.length ? fcrActComputeInactivityGaps(sorted, 15) : [];
    const slots = sorted.length ? fcrActBucketRowsByHour(sorted, gaps, dayStart, dayEnd) : [];

    if (!sorted.length) {
        log && log('Aucun mouvement trouvé sur cette journée — remise à zéro du dashboard pour ce jour.');
    } else {
        log && log(`${sorted.length} mouvement(s) répartis sur ${slots.length} créneau(x) horaire(s). Envoi de la journée (écrase les anciennes données)...`);
    }

    const success = await fcrActPushDayBatch(login, dayStart, dayEnd, slots, log);
    log && log(success
        ? `Terminé pour ${login} (${dateISO}) — données du jour remplacées.`
        : `Échec de l'envoi pour ${login} (${dateISO}).`);
}

/* -------------------------------------------------------------------------
 * Rien d'autre à changer : fcrActBackfillBuildUI() (le panneau du bouton 🔎)
 * appelle déjà fcrActBackfillDay() par login, donc bénéficie automatiquement
 * du nouveau comportement "écrase la journée".
 * ---------------------------------------------------------------------- */
