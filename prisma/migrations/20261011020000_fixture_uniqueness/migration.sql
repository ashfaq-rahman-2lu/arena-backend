-- Round labels must not permit a round-robin pair to be generated twice in the same leg.
CREATE UNIQUE INDEX "round_robin_pair_per_leg"
ON "Match" ("tournamentId", "stage", "scope", "leg", "pairingKey")
WHERE "stage" IN ('LEAGUE', 'GROUP');
