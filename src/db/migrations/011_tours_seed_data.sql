-- Costa Rica birdwatching seed data
-- NOTE: species_code is kept NULL intentionally. Fill it later from the official eBird/Clements taxonomy
-- to avoid inventing unsupported species codes.

BEGIN;

INSERT INTO country (name, acr)
VALUES ('Costa Rica', 'CR')
ON CONFLICT (acr) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO zone (country_id, name, des, rank)
SELECT c.id, 'North Zone', 'Northern Costa Rica birding region with Caribbean lowland rainforest, foothill forest, rivers, and major freshwater wetlands around Sarapiquí, San Carlos, Caño Negro, Arenal, Boca Tapada, and Bijagua.', 1
FROM country c
WHERE c.acr = 'CR'
ON CONFLICT (country_id, name) DO UPDATE
SET des = EXCLUDED.des, rank = EXCLUDED.rank, is_active = true;

INSERT INTO zone (country_id, name, des, rank)
SELECT c.id, 'Guanacaste', 'Northwestern Costa Rica birding region dominated by tropical dry forest, seasonal wetlands, mangroves, coastal habitats, and volcanic foothills.', 2
FROM country c
WHERE c.acr = 'CR'
ON CONFLICT (country_id, name) DO UPDATE
SET des = EXCLUDED.des, rank = EXCLUDED.rank, is_active = true;

INSERT INTO zone (country_id, name, des, rank)
SELECT c.id, 'Central Valley and Highlands', 'Central mountain birding region including cloud forest, volcanic highlands, oak forest, and páramo habitats that support many Costa Rica-Panama highland specialties.', 3
FROM country c
WHERE c.acr = 'CR'
ON CONFLICT (country_id, name) DO UPDATE
SET des = EXCLUDED.des, rank = EXCLUDED.rank, is_active = true;

INSERT INTO zone (country_id, name, des, rank)
SELECT c.id, 'Central Pacific', 'Pacific-slope transition birding region where drier northern habitats meet wetter southern forests, especially around Carara, Tárcoles, Jacó, Manuel Antonio, and the Savegre lowlands.', 4
FROM country c
WHERE c.acr = 'CR'
ON CONFLICT (country_id, name) DO UPDATE
SET des = EXCLUDED.des, rank = EXCLUDED.rank, is_active = true;

INSERT INTO zone (country_id, name, des, rank)
SELECT c.id, 'South Pacific and Osa', 'Southern Pacific lowland rainforest region including the Osa Peninsula, Golfo Dulce, Piedras Blancas, and Coto Brus; one of Costa Rica''s richest birding areas.', 5
FROM country c
WHERE c.acr = 'CR'
ON CONFLICT (country_id, name) DO UPDATE
SET des = EXCLUDED.des, rank = EXCLUDED.rank, is_active = true;

INSERT INTO zone (country_id, name, des, rank)
SELECT c.id, 'Caribbean Lowlands and South Caribbean', 'Humid Caribbean coastal and lowland rainforest region from Tortuguero through the Talamanca Caribbean foothills and south Caribbean coast.', 6
FROM country c
WHERE c.acr = 'CR'
ON CONFLICT (country_id, name) DO UPDATE
SET des = EXCLUDED.des, rank = EXCLUDED.rank, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Sarapiquí Rainforest Corridor', 1, 10.43, -84.02, 'Important Caribbean lowland rainforest birding corridor centered on Puerto Viejo de Sarapiquí and La Selva.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'North Zone'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Sarapiquí Rainforest Corridor'
  );
UPDATE node n
SET rank = 1, lat = 10.43, lon = -84.02, des = 'Important Caribbean lowland rainforest birding corridor centered on Puerto Viejo de Sarapiquí and La Selva.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'North Zone' AND n.name = 'Sarapiquí Rainforest Corridor';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Caño Negro and Los Chiles Wetlands', 2, 10.9, -84.77, 'Northern wetland complex around Caño Negro, Río Frío, Los Chiles, and Medio Queso.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'North Zone'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Caño Negro and Los Chiles Wetlands'
  );
UPDATE node n
SET rank = 2, lat = 10.9, lon = -84.77, des = 'Northern wetland complex around Caño Negro, Río Frío, Los Chiles, and Medio Queso.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'North Zone' AND n.name = 'Caño Negro and Los Chiles Wetlands';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Boca Tapada Rainforest', 3, 10.69, -84.19, 'Remote Caribbean lowland rainforest region near the San Carlos River, known for macaws and rainforest birding lodges.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'North Zone'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Boca Tapada Rainforest'
  );
UPDATE node n
SET rank = 3, lat = 10.69, lon = -84.19, des = 'Remote Caribbean lowland rainforest region near the San Carlos River, known for macaws and rainforest birding lodges.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'North Zone' AND n.name = 'Boca Tapada Rainforest';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Arenal and La Fortuna Foothills', 4, 10.46, -84.73, 'Foothill rainforest and lake-edge birding region around Arenal Volcano and La Fortuna.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'North Zone'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Arenal and La Fortuna Foothills'
  );
UPDATE node n
SET rank = 4, lat = 10.46, lon = -84.73, des = 'Foothill rainforest and lake-edge birding region around Arenal Volcano and La Fortuna.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'North Zone' AND n.name = 'Arenal and La Fortuna Foothills';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Tenorio-Bijagua and Río Celeste', 5, 10.73, -85.02, 'Transition-zone birding region around Bijagua, Tenorio Volcano, and Río Celeste, where Caribbean and Pacific influences meet.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'North Zone'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Tenorio-Bijagua and Río Celeste'
  );
UPDATE node n
SET rank = 5, lat = 10.73, lon = -85.02, des = 'Transition-zone birding region around Bijagua, Tenorio Volcano, and Río Celeste, where Caribbean and Pacific influences meet.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'North Zone' AND n.name = 'Tenorio-Bijagua and Río Celeste';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Palo Verde and Tempisque Wetlands', 1, 10.35, -85.35, 'Major wetland and dry-forest birding region in the lower Tempisque basin.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Guanacaste'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Palo Verde and Tempisque Wetlands'
  );
UPDATE node n
SET rank = 1, lat = 10.35, lon = -85.35, des = 'Major wetland and dry-forest birding region in the lower Tempisque basin.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Guanacaste' AND n.name = 'Palo Verde and Tempisque Wetlands';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Rincón de la Vieja and Liberia Foothills', 2, 10.83, -85.32, 'Dry forest to foothill forest birding region around Rincón de la Vieja National Park.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Guanacaste'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Rincón de la Vieja and Liberia Foothills'
  );
UPDATE node n
SET rank = 2, lat = 10.83, lon = -85.32, des = 'Dry forest to foothill forest birding region around Rincón de la Vieja National Park.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Guanacaste' AND n.name = 'Rincón de la Vieja and Liberia Foothills';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Santa Rosa and Santa Elena Peninsula', 3, 10.84, -85.62, 'Large protected dry-forest and coastal region in northwestern Guanacaste.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Guanacaste'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Santa Rosa and Santa Elena Peninsula'
  );
UPDATE node n
SET rank = 3, lat = 10.84, lon = -85.62, des = 'Large protected dry-forest and coastal region in northwestern Guanacaste.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Guanacaste' AND n.name = 'Santa Rosa and Santa Elena Peninsula';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Miravalles and Bagaces Highlands', 4, 10.75, -85.15, 'Volcanic foothill and highland birding region east of Liberia and Bagaces.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Guanacaste'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Miravalles and Bagaces Highlands'
  );
UPDATE node n
SET rank = 4, lat = 10.75, lon = -85.15, des = 'Volcanic foothill and highland birding region east of Liberia and Bagaces.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Guanacaste' AND n.name = 'Miravalles and Bagaces Highlands';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Nicoya Peninsula Dry Forest and Coast', 5, 10.08, -85.42, 'Seasonal dry-forest and coastal birding region on the Nicoya Peninsula.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Guanacaste'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Nicoya Peninsula Dry Forest and Coast'
  );
UPDATE node n
SET rank = 5, lat = 10.08, lon = -85.42, des = 'Seasonal dry-forest and coastal birding region on the Nicoya Peninsula.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Guanacaste' AND n.name = 'Nicoya Peninsula Dry Forest and Coast';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Monteverde Cloud Forest', 1, 10.3, -84.8, 'Classic Costa Rican cloud-forest birding region with reserves and private forest trails.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Central Valley and Highlands'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Monteverde Cloud Forest'
  );
UPDATE node n
SET rank = 1, lat = 10.3, lon = -84.8, des = 'Classic Costa Rican cloud-forest birding region with reserves and private forest trails.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Central Valley and Highlands' AND n.name = 'Monteverde Cloud Forest';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Talamanca Highlands - Savegre and Los Quetzales', 2, 9.55, -83.8, 'Highland cloud-forest and oak-forest region centered on San Gerardo de Dota and Los Quetzales National Park.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Central Valley and Highlands'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Talamanca Highlands - Savegre and Los Quetzales'
  );
UPDATE node n
SET rank = 2, lat = 9.55, lon = -83.8, des = 'Highland cloud-forest and oak-forest region centered on San Gerardo de Dota and Los Quetzales National Park.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Central Valley and Highlands' AND n.name = 'Talamanca Highlands - Savegre and Los Quetzales';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Central Volcanic Highlands', 3, 10.1, -84.05, 'Highland birding zone around Poás, Cinchona, Irazú, and nearby cloud forest.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Central Valley and Highlands'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Central Volcanic Highlands'
  );
UPDATE node n
SET rank = 3, lat = 10.1, lon = -84.05, des = 'Highland birding zone around Poás, Cinchona, Irazú, and nearby cloud forest.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Central Valley and Highlands' AND n.name = 'Central Volcanic Highlands';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Tapantí and Turrialba Foothills', 4, 9.76, -83.78, 'Wet Caribbean-slope foothill and montane forest birding region.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Central Valley and Highlands'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Tapantí and Turrialba Foothills'
  );
UPDATE node n
SET rank = 4, lat = 9.76, lon = -83.78, des = 'Wet Caribbean-slope foothill and montane forest birding region.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Central Valley and Highlands' AND n.name = 'Tapantí and Turrialba Foothills';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Braulio Carrillo and Quebrada González', 5, 10.16, -83.95, 'Caribbean-slope rainforest and foothill birding region along Route 32.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Central Valley and Highlands'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Braulio Carrillo and Quebrada González'
  );
UPDATE node n
SET rank = 5, lat = 10.16, lon = -83.95, des = 'Caribbean-slope rainforest and foothill birding region along Route 32.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Central Valley and Highlands' AND n.name = 'Braulio Carrillo and Quebrada González';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Carara and Tárcoles', 1, 9.78, -84.61, 'Important transition-zone birding region near Carara National Park and the Tárcoles River.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Central Pacific'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Carara and Tárcoles'
  );
UPDATE node n
SET rank = 1, lat = 9.78, lon = -84.61, des = 'Important transition-zone birding region near Carara National Park and the Tárcoles River.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Central Pacific' AND n.name = 'Carara and Tárcoles';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Manuel Antonio and Quepos', 2, 9.39, -84.14, 'Coastal Pacific forest and mangrove birding region around Quepos and Manuel Antonio.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Central Pacific'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Manuel Antonio and Quepos'
  );
UPDATE node n
SET rank = 2, lat = 9.39, lon = -84.14, des = 'Coastal Pacific forest and mangrove birding region around Quepos and Manuel Antonio.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Central Pacific' AND n.name = 'Manuel Antonio and Quepos';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Uvita and Ballena Coast', 3, 9.16, -83.74, 'Pacific coastal and foothill birding region around Uvita and Marino Ballena.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Central Pacific'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Uvita and Ballena Coast'
  );
UPDATE node n
SET rank = 3, lat = 9.16, lon = -83.74, des = 'Pacific coastal and foothill birding region around Uvita and Marino Ballena.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Central Pacific' AND n.name = 'Uvita and Ballena Coast';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Savegre Lowlands and Dominical', 4, 9.25, -83.86, 'Pacific lowland and foothill region around Dominical and the lower Savegre basin.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Central Pacific'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Savegre Lowlands and Dominical'
  );
UPDATE node n
SET rank = 4, lat = 9.25, lon = -83.86, des = 'Pacific lowland and foothill region around Dominical and the lower Savegre basin.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Central Pacific' AND n.name = 'Savegre Lowlands and Dominical';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Osa Peninsula and Corcovado', 1, 8.55, -83.5, 'Highly biodiverse Pacific lowland rainforest region centered on Corcovado National Park.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'South Pacific and Osa'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Osa Peninsula and Corcovado'
  );
UPDATE node n
SET rank = 1, lat = 8.55, lon = -83.5, des = 'Highly biodiverse Pacific lowland rainforest region centered on Corcovado National Park.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'South Pacific and Osa' AND n.name = 'Osa Peninsula and Corcovado';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Golfo Dulce and Piedras Blancas', 2, 8.7, -83.25, 'Humid Pacific rainforest region around Golfo Dulce and Piedras Blancas National Park.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'South Pacific and Osa'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Golfo Dulce and Piedras Blancas'
  );
UPDATE node n
SET rank = 2, lat = 8.7, lon = -83.25, des = 'Humid Pacific rainforest region around Golfo Dulce and Piedras Blancas National Park.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'South Pacific and Osa' AND n.name = 'Golfo Dulce and Piedras Blancas';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Coto Brus and Las Cruces', 3, 8.79, -82.96, 'Southern highland and foothill birding region near San Vito and the Panama border.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'South Pacific and Osa'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Coto Brus and Las Cruces'
  );
UPDATE node n
SET rank = 3, lat = 8.79, lon = -82.96, des = 'Southern highland and foothill birding region near San Vito and the Panama border.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'South Pacific and Osa' AND n.name = 'Coto Brus and Las Cruces';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Tortuguero and Northern Caribbean Canals', 1, 10.54, -83.5, 'Canal, lagoon, swamp forest, and lowland rainforest birding region on the northern Caribbean coast.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Caribbean Lowlands and South Caribbean'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Tortuguero and Northern Caribbean Canals'
  );
UPDATE node n
SET rank = 1, lat = 10.54, lon = -83.5, des = 'Canal, lagoon, swamp forest, and lowland rainforest birding region on the northern Caribbean coast.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Caribbean Lowlands and South Caribbean' AND n.name = 'Tortuguero and Northern Caribbean Canals';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Guápiles and Caribbean Foothills', 2, 10.2, -83.78, 'Caribbean lowland-to-foothill birding region near Guápiles, Guácimo, and Siquirres.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Caribbean Lowlands and South Caribbean'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Guápiles and Caribbean Foothills'
  );
UPDATE node n
SET rank = 2, lat = 10.2, lon = -83.78, des = 'Caribbean lowland-to-foothill birding region near Guápiles, Guácimo, and Siquirres.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Caribbean Lowlands and South Caribbean' AND n.name = 'Guápiles and Caribbean Foothills';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT NULL, z.id, 'Puerto Viejo and Gandoca-Manzanillo', 3, 9.63, -82.7, 'South Caribbean coastal rainforest, beach, and wetland birding region.'
FROM zone z JOIN country c ON c.id = z.country_id
WHERE c.acr = 'CR' AND z.name = 'Caribbean Lowlands and South Caribbean'
  AND NOT EXISTS (
    SELECT 1 FROM node n
    WHERE n.parent_id IS NULL AND n.zone_id = z.id AND n.name = 'Puerto Viejo and Gandoca-Manzanillo'
  );
UPDATE node n
SET rank = 3, lat = 9.63, lon = -82.7, des = 'South Caribbean coastal rainforest, beach, and wetland birding region.', is_active = true
FROM zone z JOIN country c ON c.id = z.country_id
WHERE n.parent_id IS NULL AND n.zone_id = z.id AND c.acr = 'CR'
  AND z.name = 'Caribbean Lowlands and South Caribbean' AND n.name = 'Puerto Viejo and Gandoca-Manzanillo';

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'La Selva Biological Station', 1, 10.431, -84.005, 'Well-known OTS research station and one of Costa Rica''s classic lowland rainforest birding sites.'
FROM node p
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Tirimbina Biological Reserve', 2, 10.41, -84.12, 'Accessible Sarapiquí rainforest reserve with trails and river forest habitat.'
FROM node p
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Caño Negro Wildlife Refuge', 1, 10.9, -84.77, 'Major freshwater wetland and wildlife refuge known for waterbirds and marsh species.'
FROM node p
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Medio Queso Wetlands', 2, 11.05, -84.69, 'Wetland and marsh area near Los Chiles, visited for northern wetland birds.'
FROM node p
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Laguna del Lagarto Lodge', 1, 10.692, -84.187, 'Birding lodge and rainforest reserve in Boca Tapada.'
FROM node p
WHERE p.name = 'Boca Tapada Rainforest' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Maquenque Eco Lodge Area', 2, 10.67, -84.185, 'Rainforest lodge area within the San Carlos lowlands near Maquenque National Wildlife Refuge.'
FROM node p
WHERE p.name = 'Boca Tapada Rainforest' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Arenal Observatory Lodge', 1, 10.438, -84.703, 'Classic birding lodge on the forested slopes below Arenal Volcano.'
FROM node p
WHERE p.name = 'Arenal and La Fortuna Foothills' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Mistico Arenal Hanging Bridges', 2, 10.488, -84.756, 'Foothill rainforest bridge trail near Arenal used for birding and wildlife watching.'
FROM node p
WHERE p.name = 'Arenal and La Fortuna Foothills' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Tapir Valley Nature Reserve', 1, 10.75, -85.02, 'Private reserve near Bijagua known by birders for foothill forest and wetland-edge habitats.'
FROM node p
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Heliconias Rainforest Lodge and Hanging Bridges', 2, 10.795, -84.965, 'Foothill rainforest lodge and hanging bridges near Bijagua.'
FROM node p
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Tenorio Volcano National Park - Río Celeste', 3, 10.704, -84.999, 'National park sector visited for Río Celeste and Tenorio foothill forest.'
FROM node p
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Palo Verde National Park', 1, 10.35, -85.35, 'Important national park with seasonal wetlands, dry forest, and waterbird concentrations.'
FROM node p
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Palo Verde Biological Station', 2, 10.35, -85.35, 'OTS research station inside Palo Verde National Park.'
FROM node p
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Hacienda Solimar', 3, 10.44, -85.2, 'Private ranch and wetland area visited by birding tours in Guanacaste.'
FROM node p
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Rincón de la Vieja National Park', 1, 10.83, -85.32, 'Volcanic national park with dry forest, foothill forest, and higher elevation habitats.'
FROM node p
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Curubandé Area', 2, 10.75, -85.35, 'Dry-forest and ranchland area near the main access to Rincón de la Vieja.'
FROM node p
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Santa Rosa National Park', 1, 10.84, -85.62, 'Flagship protected tropical dry forest site in northwestern Costa Rica.'
FROM node p
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Santa Elena Peninsula', 2, 10.92, -85.91, 'Remote coastal dry forest and marine-influenced area in the Área de Conservación Guanacaste.'
FROM node p
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Miravalles Volcano Region', 1, 10.75, -85.15, 'Guanacaste highland and foothill forest region with cloud-forest influence.'
FROM node p
WHERE p.name = 'Miravalles and Bagaces Highlands' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Cañas-Bagaces Dry Forest Corridor', 2, 10.43, -85.08, 'Dry-forest and open-country corridor around Cañas and Bagaces.'
FROM node p
WHERE p.name = 'Miravalles and Bagaces Highlands' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Diriá National Park', 1, 10.08, -85.42, 'Protected dry forest in the Nicoya Peninsula.'
FROM node p
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Junquillal Bay National Wildlife Refuge', 2, 10.94, -85.7, 'Coastal refuge with beach, mangrove, estuary, and dry-forest habitats.'
FROM node p
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Monteverde Cloud Forest Biological Reserve', 1, 10.3, -84.8, 'Famous cloud-forest reserve and one of Costa Rica''s best-known birding sites.'
FROM node p
WHERE p.name = 'Monteverde Cloud Forest' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Curi-Cancha Reserve', 2, 10.31, -84.815, 'Private reserve in Monteverde with cloud forest and edge habitats used by birders.'
FROM node p
WHERE p.name = 'Monteverde Cloud Forest' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'San Gerardo de Dota', 1, 9.56, -83.8, 'Highland valley and cloud-forest birding destination famous for Resplendent Quetzal.'
FROM node p
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Los Quetzales National Park', 2, 9.55, -83.8, 'Protected highland cloud forest in the Talamanca range.'
FROM node p
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Cerro de la Muerte', 3, 9.56, -83.75, 'High-elevation road-accessible páramo and oak-forest birding area.'
FROM node p
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Poás-Cinchona Corridor', 1, 10.2, -84.17, 'Middle and high elevation birding corridor on the Caribbean slope of Poás.'
FROM node p
WHERE p.name = 'Central Volcanic Highlands' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Irazú Volcano Highlands', 2, 9.98, -83.85, 'High-elevation volcanic habitats near Irazú.'
FROM node p
WHERE p.name = 'Central Volcanic Highlands' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Tapantí National Park', 1, 9.76, -83.78, 'Very wet montane forest national park in the Orosi-Tapantí area.'
FROM node p
WHERE p.name = 'Tapantí and Turrialba Foothills' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Rancho Naturalista', 2, 9.86, -83.74, 'Classic birding lodge near Turrialba with foothill forest and gardens.'
FROM node p
WHERE p.name = 'Tapantí and Turrialba Foothills' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'El Copal Reserve', 3, 10.23, -84.34, 'Caribbean slope foothill forest reserve visited by advanced birders.'
FROM node p
WHERE p.name = 'Tapantí and Turrialba Foothills' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Quebrada González Sector', 1, 10.16, -83.95, 'Rainforest sector of Braulio Carrillo National Park along Route 32.'
FROM node p
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Braulio Carrillo National Park', 2, 10.12, -84.0, 'Large protected area spanning Caribbean-slope rainforest and montane habitats.'
FROM node p
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Carara National Park', 1, 9.78, -84.61, 'National park at the transition between tropical dry forest and humid Pacific forest.'
FROM node p
WHERE p.name = 'Carara and Tárcoles' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Tárcoles River and Mangroves', 2, 9.79, -84.64, 'River and mangrove birding area near Carara and the Pacific coast.'
FROM node p
WHERE p.name = 'Carara and Tárcoles' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Cerro Lodge Area', 3, 9.76, -84.63, 'Birding lodge and dry-forest edge area near Carara and Tárcoles.'
FROM node p
WHERE p.name = 'Carara and Tárcoles' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Manuel Antonio National Park', 1, 9.39, -84.14, 'Small but well-known coastal national park with humid Pacific forest.'
FROM node p
WHERE p.name = 'Manuel Antonio and Quepos' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Damas Island Mangroves', 2, 9.48, -84.2, 'Mangrove estuary near Quepos used for boat-based wildlife and birding tours.'
FROM node p
WHERE p.name = 'Manuel Antonio and Quepos' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Marino Ballena National Park', 1, 9.16, -83.74, 'Coastal national park with marine, beach, mangrove, and nearby forest habitats.'
FROM node p
WHERE p.name = 'Uvita and Ballena Coast' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Uvita Foothills', 2, 9.18, -83.75, 'Pacific foothill forest and edge habitats above Uvita.'
FROM node p
WHERE p.name = 'Uvita and Ballena Coast' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Hacienda Barú', 1, 9.28, -83.88, 'Private reserve near Dominical with forest, wetland, and coastal habitats.'
FROM node p
WHERE p.name = 'Savegre Lowlands and Dominical' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Portalón and Savegre Lowlands', 2, 9.32, -83.93, 'Lowland and foothill birding area between Quepos and Dominical.'
FROM node p
WHERE p.name = 'Savegre Lowlands and Dominical' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Corcovado National Park - Sirena', 1, 8.48, -83.59, 'Remote biological station area in Corcovado National Park''s lowland rainforest.'
FROM node p
WHERE p.name = 'Osa Peninsula and Corcovado' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Carate and La Leona', 2, 8.44, -83.45, 'Forest and coastal access area on the southeastern Osa Peninsula.'
FROM node p
WHERE p.name = 'Osa Peninsula and Corcovado' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Drake Bay', 3, 8.69, -83.66, 'Coastal rainforest birding base on the northwestern Osa Peninsula.'
FROM node p
WHERE p.name = 'Osa Peninsula and Corcovado' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Piedras Blancas National Park', 1, 8.7, -83.25, 'Lowland rainforest national park near Golfo Dulce.'
FROM node p
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Esquinas Rainforest Lodge Area', 2, 8.7, -83.21, 'Rainforest lodge area near Piedras Blancas and Golfo Dulce.'
FROM node p
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Las Cruces Biological Station', 1, 8.79, -82.96, 'OTS biological station and botanical garden near San Vito.'
FROM node p
WHERE p.name = 'Coto Brus and Las Cruces' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'San Vito Area', 2, 8.82, -82.97, 'Southern Costa Rica foothill and agricultural mosaic birding area.'
FROM node p
WHERE p.name = 'Coto Brus and Las Cruces' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Tortuguero National Park', 1, 10.54, -83.5, 'Caribbean lowland national park known for canals, rainforest, and coastal wetlands.'
FROM node p
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Tortuguero Village Canals', 2, 10.545, -83.505, 'Boat-based canal birding area around Tortuguero village.'
FROM node p
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Guápiles Area', 1, 10.21, -83.79, 'Caribbean lowland town area used as access to nearby rainforest and foothill birding.'
FROM node p
WHERE p.name = 'Guápiles and Caribbean Foothills' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Veragua Rainforest Area', 2, 9.93, -83.19, 'Caribbean-slope rainforest and aerial tram area near Limón.'
FROM node p
WHERE p.name = 'Guápiles and Caribbean Foothills' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Gandoca-Manzanillo Wildlife Refuge', 1, 9.63, -82.65, 'South Caribbean coastal refuge with rainforest, wetland, beach, and mangrove habitats.'
FROM node p
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO node (parent_id, zone_id, name, rank, lat, lon, des)
SELECT p.id, p.zone_id, 'Cahuita National Park', 2, 9.74, -82.84, 'South Caribbean coastal national park with rainforest and coastal habitats.'
FROM node p
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND p.parent_id IS NULL
ON CONFLICT (parent_id, zone_id, name) DO UPDATE
SET rank = EXCLUDED.rank, lat = EXCLUDED.lat, lon = EXCLUDED.lon, des = EXCLUDED.des, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('agaher1', 'Agami Heron', ARRAY['wetland', 'rare']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('ameoys', 'American Oystercatcher', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('ampkin1', 'American Pygmy Kingfisher', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('baitro1', 'Baird''s Trogon', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('banwre1', 'Banded Wren', ARRAY['highland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('banumb1', 'Bare-necked Umbrellabird', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('btther1', 'Bare-throated Tiger-Heron', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('blagua1', 'Black Guan', ARRAY['highland', 'near-endemic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('bawowl1', 'Black-and-white Owl', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('bayfly1', 'Black-and-yellow Silky-flycatcher', ARRAY['Black-and-yellow Phainoptila']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('baytan2', 'Black-and-yellow Tanager', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('blbhum1', 'Black-bellied Hummingbird', ARRAY['highland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('bbwduc', 'Black-bellied Whistling-Duck', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('bcatan1', 'Black-cheeked Ant-Tanager', ARRAY['endemic', 'pacific-slope']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('blchaw1', 'Black-collared Hawk', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('blccoq1', 'Black-crested Coquette', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('blcant1', 'Black-crowned Antpitta', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('wesant1', 'Black-crowned Antshrike', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('bewqua1', 'Black-eared Wood-Quail', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('blfsol1', 'Black-faced Solitaire', ARRAY['highland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('blhant2', 'Black-hooded Antshrike', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('bobher1', 'Boat-billed Heron', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('brnboo', 'Brown Booby', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('chbant1', 'Chestnut-backed Antbird', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('olcyel1', 'Olive-crowned Yellowthroat', ARRAY['Chiriqui Yellowthroat']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('colred1', 'Collared Redstart', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('coheme1', 'Coppery-headed Emerald', ARRAY['endemic', 'cloud-forest']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('dstkne', 'Double-striped Thick-knee', ARRAY['dry-forest']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('dumant1', 'Dull-mantled Antbird', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('eletro2', 'Elegant Trogon', ARRAY['dry-forest']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('noremt1', 'Northern Emerald-Toucanet', ARRAY['Emerald Toucanet', 'Tucancillo Verde', 'Tucancito Verde']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('father1', 'Fasciated Tiger-Heron', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('fepowl', 'Ferruginous Pygmy-Owl', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('fibara1', 'Fiery-billed Aracari', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('fithum1', 'Fiery-throated Hummingbird', ARRAY['highland', 'near-endemic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('fltwar1', 'Flame-throated Warbler', ARRAY['highland', 'near-endemic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('gobchl1', 'Golden-browed Chlorophonia', ARRAY['highland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('gonwoo1', 'Golden-naped Woodpecker', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('grbcra1', 'Gray-breasted Crake', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('grecur1', 'Great Curassow', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('grgmac', 'Great Green Macaw', ARRAY['caribbean-slope', 'rare', 'iconic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('greibi1', 'Green Ibis', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('jabiru', 'Jabiru', ARRAY['wetland', 'rare']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('kebmot1', 'Keel-billed Motmot', ARRAY['caribbean-slope']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('kebtou1', 'Keel-billed Toucan', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('kinvul1', 'King Vulture', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('lattro1', 'Lattice-tailed Trogon', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('legcuc1', 'Lesser Ground-Cuckoo', ARRAY['dry-forest', 'rare']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('limpki', 'Limpkin', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('lotman1', 'Long-tailed Manakin', ARRAY['dry-forest']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('ltsfly1', 'Long-tailed Silky-flycatcher', ARRAY['highland', 'near-endemic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('lovcot1', 'Lovely Cotinga', ARRAY['caribbean-slope', 'rare']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('magfri', 'Magnificent Frigatebird', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('manhum1', 'Mangrove Hummingbird', ARRAY['endemic', 'mangrove']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('manvir1', 'Mangrove Vireo', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('manwar1', 'Mangrove Yellow Warbler', ARRAY['highland', 'Mangrove Warbler']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('nicgra1', 'Nicaraguan Grackle', ARRAY['wetland', 'rare']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('nosfly1', 'Northern Scrub-Flycatcher', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('ocbant1', 'Ochre-breasted Antpitta', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('coltro1', 'Collared Trogon', ARRAY['Orange-bellied Trogon', 'Trogón vientrianaranjado', 'Trogón collarejo']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('orheag1', 'Ornate Hawk-Eagle', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('panfly1', 'Panama Flycatcher', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('pebfin1', 'Peg-billed Finch', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('pinbit1', 'Pinnated Bittern', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('prbbar1', 'Prong-billed Barbet', ARRAY['cloud-forest']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('redegr', 'Reddish Egret', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('resque1', 'Resplendent Quetzal', ARRAY['cloud-forest', 'highland', 'iconic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('rivwre1', 'Riverside Wren', ARRAY['highland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('rosspo1', 'Roseate Spoonbill', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('rufgle1', 'Ruddy Foliage-gleaner', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('rufmot1', 'Rufous Motmot', ARRAY['dry-forest']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('ruwtan1', 'Rufous-winged Tanager', ARRAY['caribbean-slope']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('ruwwoo1', 'Rufous-winged Woodpecker', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('scaant1', 'Scaled Antpitta', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('scamac1', 'Scarlet Macaw', ARRAY['iconic', 'pacific-slope']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('semhaw', 'Semiplumbeous Hawk', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('sharpb1', 'Sharpbill', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('siftap1', 'Silvery-fronted Tapaculo', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('slttro1', 'Slaty-tailed Trogon', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('snakit', 'Snail Kite', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('snowca1', 'Snowcap', ARRAY['caribbean-slope', 'rare']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('snocot1', 'Snowy Cotinga', ARRAY['caribbean-slope']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('snbhum1', 'Snowy-bellied Hummingbird', ARRAY['highland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('soorob1', 'Sooty Thrush', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('stcant2', 'Streak-chested Antpitta', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('sunbit1', 'Sunbittern', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('sungre1', 'Sungrebe', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('tacfly1', 'Tawny-chested Flycatcher', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('thwbel', 'Three-wattled Bellbird', ARRAY['cloud-forest', 'migratory']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('timwre1', 'Timberline Wren', ARRAY['highland', 'near-endemic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('todmot1', 'Tody Motmot', ARRAY['caribbean-slope']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('turcot1', 'Turquoise Cotinga', ARRAY['pacific-slope', 'rare']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('tubmot1', 'Turquoise-browed Motmot', ARRAY['dry-forest', 'iconic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('voljun1', 'Volcano Junco', ARRAY['highland', 'near-endemic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('whfnun1', 'White-fronted Nunbird', ARRAY[]::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('wtmjay1', 'White-throated Magpie-Jay', ARRAY['dry-forest', 'iconic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('wilplo', 'Wilson''s Plover', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('woosto', 'Wood Stork', ARRAY['wetland']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('yebcot1', 'Yellow-billed Cotinga', ARRAY['rare', 'pacific-slope']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('ycnher', 'Yellow-crowned Night Heron', ARRAY['squawk', 'wetland', 'American Night Heron', 'Martinete Coronado']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('yeetou1', 'Yellow-eared Toucanet', ARRAY['foothill']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('yenpar1', 'Yellow-naped Amazon', ARRAY['Yellow-naped Parrot']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds (species_code, name, tags)
VALUES ('yewvir1', 'Yellow-winged Vireo', ARRAY['highland', 'near-endemic']::TEXT[])
ON CONFLICT (name) DO UPDATE
SET tags = EXCLUDED.tags, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Green Macaw'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'La Selva Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowy Cotinga'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'La Selva Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Semiplumbeous Hawk'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'La Selva Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Curassow'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'La Selva Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-crowned Antpitta'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'La Selva Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Green Macaw'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'Tirimbina Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowy Cotinga'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'Tirimbina Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Curassow'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'Tirimbina Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-fronted Nunbird'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'Tirimbina Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fasciated Tiger-Heron'
WHERE p.name = 'Sarapiquí Rainforest Corridor' AND n.name = 'Tirimbina Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Jabiru'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Caño Negro Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Nicaraguan Grackle'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Caño Negro Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Pinnated Bittern'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Caño Negro Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sungrebe'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Caño Negro Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Gray-breasted Crake'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Caño Negro Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Nicaraguan Grackle'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Medio Queso Wetlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Jabiru'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Medio Queso Wetlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Pinnated Bittern'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Medio Queso Wetlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'American Pygmy Kingfisher'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Medio Queso Wetlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sungrebe'
WHERE p.name = 'Caño Negro and Los Chiles Wetlands' AND n.name = 'Medio Queso Wetlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Green Macaw'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Laguna del Lagarto Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Agami Heron'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Laguna del Lagarto Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'King Vulture'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Laguna del Lagarto Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Rufous-winged Woodpecker'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Laguna del Lagarto Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-crowned Antshrike'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Laguna del Lagarto Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Green Macaw'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Maquenque Eco Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Agami Heron'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Maquenque Eco Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowy Cotinga'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Maquenque Eco Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sungrebe'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Maquenque Eco Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Green Ibis'
WHERE p.name = 'Boca Tapada Rainforest' AND n.name = 'Maquenque Eco Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Keel-billed Motmot'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Arenal Observatory Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lovely Cotinga'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Arenal Observatory Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Ornate Hawk-Eagle'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Arenal Observatory Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-crested Coquette'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Arenal Observatory Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-fronted Nunbird'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Arenal Observatory Lodge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Keel-billed Motmot'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Mistico Arenal Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Rufous Motmot'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Mistico Arenal Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-fronted Nunbird'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Mistico Arenal Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Dull-mantled Antbird'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Mistico Arenal Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-crested Coquette'
WHERE p.name = 'Arenal and La Fortuna Foothills' AND n.name = 'Mistico Arenal Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Tody Motmot'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tapir Valley Nature Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Rufous-winged Tanager'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tapir Valley Nature Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Yellow-eared Toucanet'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tapir Valley Nature Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lovely Cotinga'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tapir Valley Nature Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Keel-billed Motmot'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tapir Valley Nature Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Tody Motmot'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Heliconias Rainforest Lodge and Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Rufous-winged Tanager'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Heliconias Rainforest Lodge and Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Yellow-eared Toucanet'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Heliconias Rainforest Lodge and Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Keel-billed Motmot'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Heliconias Rainforest Lodge and Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-eared Wood-Quail'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Heliconias Rainforest Lodge and Hanging Bridges'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Yellow-eared Toucanet'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tenorio Volcano National Park - Río Celeste'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black Guan'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tenorio Volcano National Park - Río Celeste'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Tody Motmot'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tenorio Volcano National Park - Río Celeste'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Rufous-winged Tanager'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tenorio Volcano National Park - Río Celeste'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Northern Emerald-Toucanet'
WHERE p.name = 'Tenorio-Bijagua and Río Celeste' AND n.name = 'Tenorio Volcano National Park - Río Celeste'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Jabiru'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Roseate Spoonbill'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Boat-billed Heron'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-collared Hawk'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snail Kite'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Jabiru'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Limpkin'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Bare-throated Tiger-Heron'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-bellied Whistling-Duck'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-throated Magpie-Jay'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Palo Verde Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Jabiru'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Hacienda Solimar'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Wood Stork'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Hacienda Solimar'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Roseate Spoonbill'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Hacienda Solimar'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snail Kite'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Hacienda Solimar'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Double-striped Thick-knee'
WHERE p.name = 'Palo Verde and Tempisque Wetlands' AND n.name = 'Hacienda Solimar'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Tody Motmot'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Rincón de la Vieja National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Three-wattled Bellbird'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Rincón de la Vieja National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-faced Solitaire'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Rincón de la Vieja National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black Guan'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Rincón de la Vieja National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Elegant Trogon'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Rincón de la Vieja National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-throated Magpie-Jay'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Curubandé Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Turquoise-browed Motmot'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Curubandé Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Elegant Trogon'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Curubandé Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lesser Ground-Cuckoo'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Curubandé Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Long-tailed Manakin'
WHERE p.name = 'Rincón de la Vieja and Liberia Foothills' AND n.name = 'Curubandé Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Long-tailed Manakin'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Rosa National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lesser Ground-Cuckoo'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Rosa National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Turquoise-browed Motmot'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Rosa National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-throated Magpie-Jay'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Rosa National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Elegant Trogon'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Rosa National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-throated Magpie-Jay'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Elena Peninsula'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Elegant Trogon'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Elena Peninsula'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Mangrove Vireo'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Elena Peninsula'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Brown Booby'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Elena Peninsula'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Magnificent Frigatebird'
WHERE p.name = 'Santa Rosa and Santa Elena Peninsula' AND n.name = 'Santa Elena Peninsula'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black Guan'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Miravalles Volcano Region'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-faced Solitaire'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Miravalles Volcano Region'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Resplendent Quetzal'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Miravalles Volcano Region'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Northern Emerald-Toucanet'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Miravalles Volcano Region'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Collared Redstart'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Miravalles Volcano Region'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-throated Magpie-Jay'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Cañas-Bagaces Dry Forest Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Turquoise-browed Motmot'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Cañas-Bagaces Dry Forest Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Double-striped Thick-knee'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Cañas-Bagaces Dry Forest Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Elegant Trogon'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Cañas-Bagaces Dry Forest Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lesser Ground-Cuckoo'
WHERE p.name = 'Miravalles and Bagaces Highlands' AND n.name = 'Cañas-Bagaces Dry Forest Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Long-tailed Manakin'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Diriá National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-throated Magpie-Jay'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Diriá National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Elegant Trogon'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Diriá National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lesser Ground-Cuckoo'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Diriá National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Banded Wren'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Diriá National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'American Oystercatcher'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Junquillal Bay National Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Mangrove Yellow Warbler'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Junquillal Bay National Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Roseate Spoonbill'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Junquillal Bay National Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Reddish Egret'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Junquillal Bay National Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Wilson''s Plover'
WHERE p.name = 'Nicoya Peninsula Dry Forest and Coast' AND n.name = 'Junquillal Bay National Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Resplendent Quetzal'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Monteverde Cloud Forest Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Three-wattled Bellbird'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Monteverde Cloud Forest Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black Guan'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Monteverde Cloud Forest Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Prong-billed Barbet'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Monteverde Cloud Forest Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Golden-browed Chlorophonia'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Monteverde Cloud Forest Biological Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Resplendent Quetzal'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Curi-Cancha Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Three-wattled Bellbird'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Curi-Cancha Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black Guan'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Curi-Cancha Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Collared Trogon'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Curi-Cancha Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Prong-billed Barbet'
WHERE p.name = 'Monteverde Cloud Forest' AND n.name = 'Curi-Cancha Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Resplendent Quetzal'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'San Gerardo de Dota'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-throated Hummingbird'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'San Gerardo de Dota'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Flame-throated Warbler'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'San Gerardo de Dota'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Long-tailed Silky-flycatcher'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'San Gerardo de Dota'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Yellow-winged Vireo'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'San Gerardo de Dota'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Resplendent Quetzal'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Los Quetzales National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black Guan'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Los Quetzales National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-throated Hummingbird'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Los Quetzales National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Collared Redstart'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Los Quetzales National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Flame-throated Warbler'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Los Quetzales National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Volcano Junco'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Cerro de la Muerte'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Timberline Wren'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Cerro de la Muerte'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Peg-billed Finch'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Cerro de la Muerte'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-throated Hummingbird'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Cerro de la Muerte'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sooty Thrush'
WHERE p.name = 'Talamanca Highlands - Savegre and Los Quetzales' AND n.name = 'Cerro de la Muerte'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Coppery-headed Emerald'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Poás-Cinchona Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Prong-billed Barbet'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Poás-Cinchona Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black Guan'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Poás-Cinchona Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Resplendent Quetzal'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Poás-Cinchona Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-bellied Hummingbird'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Poás-Cinchona Corridor'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Volcano Junco'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Irazú Volcano Highlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Timberline Wren'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Irazú Volcano Highlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-throated Hummingbird'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Irazú Volcano Highlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sooty Thrush'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Irazú Volcano Highlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Peg-billed Finch'
WHERE p.name = 'Central Volcanic Highlands' AND n.name = 'Irazú Volcano Highlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Silvery-fronted Tapaculo'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Tapantí National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Ochre-breasted Antpitta'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Tapantí National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black Guan'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Tapantí National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-and-yellow Silky-flycatcher'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Tapantí National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Scaled Antpitta'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Tapantí National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowcap'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Rancho Naturalista'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Tawny-chested Flycatcher'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Rancho Naturalista'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sunbittern'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Rancho Naturalista'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lattice-tailed Trogon'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Rancho Naturalista'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sharpbill'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'Rancho Naturalista'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Bare-necked Umbrellabird'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'El Copal Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sharpbill'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'El Copal Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lattice-tailed Trogon'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'El Copal Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-and-yellow Tanager'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'El Copal Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Tawny-chested Flycatcher'
WHERE p.name = 'Tapantí and Turrialba Foothills' AND n.name = 'El Copal Reserve'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-crowned Antpitta'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Quebrada González Sector'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lattice-tailed Trogon'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Quebrada González Sector'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sharpbill'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Quebrada González Sector'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-fronted Nunbird'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Quebrada González Sector'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Dull-mantled Antbird'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Quebrada González Sector'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Bare-necked Umbrellabird'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Braulio Carrillo National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-crowned Antpitta'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Braulio Carrillo National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lattice-tailed Trogon'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Braulio Carrillo National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Ornate Hawk-Eagle'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Braulio Carrillo National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sharpbill'
WHERE p.name = 'Braulio Carrillo and Quebrada González' AND n.name = 'Braulio Carrillo National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Scarlet Macaw'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Carara National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Carara National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Carara National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-hooded Antshrike'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Carara National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Streak-chested Antpitta'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Carara National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Mangrove Hummingbird'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Tárcoles River and Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Panama Flycatcher'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Tárcoles River and Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Boat-billed Heron'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Tárcoles River and Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Roseate Spoonbill'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Tárcoles River and Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Scarlet Macaw'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Tárcoles River and Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Scarlet Macaw'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Cerro Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-and-white Owl'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Cerro Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Ferruginous Pygmy-Owl'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Cerro Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Turquoise-browed Motmot'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Cerro Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Yellow-naped Amazon'
WHERE p.name = 'Carara and Tárcoles' AND n.name = 'Cerro Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Manuel Antonio National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Manuel Antonio National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Riverside Wren'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Manuel Antonio National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-hooded Antshrike'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Manuel Antonio National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Chestnut-backed Antbird'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Manuel Antonio National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Mangrove Hummingbird'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Damas Island Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Panama Flycatcher'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Damas Island Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Boat-billed Heron'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Damas Island Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Northern Scrub-Flycatcher'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Damas Island Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Yellow-crowned Night Heron'
WHERE p.name = 'Manuel Antonio and Quepos' AND n.name = 'Damas Island Mangroves'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Marino Ballena National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Marino Ballena National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Riverside Wren'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Marino Ballena National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Scarlet Macaw'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Marino Ballena National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Turquoise Cotinga'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Marino Ballena National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Turquoise Cotinga'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Uvita Foothills'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Uvita Foothills'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Uvita Foothills'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-cheeked Ant-Tanager'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Uvita Foothills'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Golden-naped Woodpecker'
WHERE p.name = 'Uvita and Ballena Coast' AND n.name = 'Uvita Foothills'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Hacienda Barú'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Hacienda Barú'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Riverside Wren'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Hacienda Barú'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-hooded Antshrike'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Hacienda Barú'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Scarlet Macaw'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Hacienda Barú'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Turquoise Cotinga'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Portalón and Savegre Lowlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Portalón and Savegre Lowlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Portalón and Savegre Lowlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Riverside Wren'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Portalón and Savegre Lowlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Golden-naped Woodpecker'
WHERE p.name = 'Savegre Lowlands and Dominical' AND n.name = 'Portalón and Savegre Lowlands'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-cheeked Ant-Tanager'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Corcovado National Park - Sirena'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Yellow-billed Cotinga'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Corcovado National Park - Sirena'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Corcovado National Park - Sirena'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Corcovado National Park - Sirena'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Curassow'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Corcovado National Park - Sirena'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-cheeked Ant-Tanager'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Carate and La Leona'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Yellow-billed Cotinga'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Carate and La Leona'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Scarlet Macaw'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Carate and La Leona'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Carate and La Leona'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Curassow'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Carate and La Leona'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-cheeked Ant-Tanager'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Drake Bay'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Drake Bay'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Drake Bay'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Scarlet Macaw'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Drake Bay'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Curassow'
WHERE p.name = 'Osa Peninsula and Corcovado' AND n.name = 'Drake Bay'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-cheeked Ant-Tanager'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Piedras Blancas National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Yellow-billed Cotinga'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Piedras Blancas National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Piedras Blancas National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Piedras Blancas National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Curassow'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Piedras Blancas National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-cheeked Ant-Tanager'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Esquinas Rainforest Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Baird''s Trogon'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Esquinas Rainforest Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Fiery-billed Aracari'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Esquinas Rainforest Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Riverside Wren'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Esquinas Rainforest Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Curassow'
WHERE p.name = 'Golfo Dulce and Piedras Blancas' AND n.name = 'Esquinas Rainforest Lodge Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowy-bellied Hummingbird'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'Las Cruces Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Turquoise Cotinga'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'Las Cruces Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-cheeked Ant-Tanager'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'Las Cruces Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Ruddy Foliage-gleaner'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'Las Cruces Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Olive-crowned Yellowthroat'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'Las Cruces Biological Station'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowy-bellied Hummingbird'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'San Vito Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Turquoise Cotinga'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'San Vito Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Olive-crowned Yellowthroat'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'San Vito Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-cheeked Ant-Tanager'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'San Vito Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Ruddy Foliage-gleaner'
WHERE p.name = 'Coto Brus and Las Cruces' AND n.name = 'San Vito Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Agami Heron'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Green Macaw'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sungrebe'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowy Cotinga'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Green Ibis'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Agami Heron'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero Village Canals'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Sungrebe'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero Village Canals'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Boat-billed Heron'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero Village Canals'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Green Ibis'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero Village Canals'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Bare-throated Tiger-Heron'
WHERE p.name = 'Tortuguero and Northern Caribbean Canals' AND n.name = 'Tortuguero Village Canals'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowy Cotinga'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Guápiles Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Green Macaw'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Guápiles Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-fronted Nunbird'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Guápiles Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Semiplumbeous Hawk'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Guápiles Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Curassow'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Guápiles Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowy Cotinga'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Veragua Rainforest Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Black-crowned Antpitta'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Veragua Rainforest Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Lattice-tailed Trogon'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Veragua Rainforest Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Dull-mantled Antbird'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Veragua Rainforest Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-fronted Nunbird'
WHERE p.name = 'Guápiles and Caribbean Foothills' AND n.name = 'Veragua Rainforest Area'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Green Macaw'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Gandoca-Manzanillo Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Snowy Cotinga'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Gandoca-Manzanillo Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Agami Heron'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Gandoca-Manzanillo Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Slaty-tailed Trogon'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Gandoca-Manzanillo Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Green Ibis'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Gandoca-Manzanillo Wildlife Refuge'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 1
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Great Green Macaw'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Cahuita National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 2
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Slaty-tailed Trogon'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Cahuita National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 3
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Rufous Motmot'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Cahuita National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 4
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'White-fronted Nunbird'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Cahuita National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

INSERT INTO birds_by_node (node_id, bird_id, rank)
SELECT n.id, b.id, 5
FROM node n
JOIN node p ON p.id = n.parent_id
JOIN birds b ON b.name = 'Keel-billed Toucan'
WHERE p.name = 'Puerto Viejo and Gandoca-Manzanillo' AND n.name = 'Cahuita National Park'
ON CONFLICT (node_id, bird_id) DO UPDATE
SET rank = EXCLUDED.rank, is_active = true;

COMMIT;
