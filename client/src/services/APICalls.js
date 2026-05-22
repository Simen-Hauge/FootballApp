export const getMatches = async (matchweek) => {
    try {
        const response = await fetch(`https://footballapp-u80w.onrender.com/api/matches/by-matchweek/?matchweek=${matchweek}`);
        const data = await response.json();

        if (!response.ok) {
            console.log('Error', data.error);
            return;
        }
        return data;
    } 
    catch (error) {
        console.error("Error getting matches", error);
    }
}

export const getCurrentMatchweek = async (matchweek) => {
    try {
        const date = new Date();
        const response = await fetch(`https://footballapp-u80w.onrender.com/api/matches/matchweek/?kickoffDateTime=${date.toISOString()}`);
        const data = await response.json();

        if (!response.ok) {
            console.log('Error', data.error);
            return;
        }
        console.log('Current matchweek is', data.matchweek);
        return data.matchweek;
    } 
    catch (error) {
        console.error("Error getting matches", error);
    }
}

export const getPredictions = async (email, matchid) => {
    try {
    const response = await fetch(`https://footballapp-u80w.onrender.com/api/predictions/?email=${email}&matchid=${matchid}`)
    const data = await response.json()
 
    if (!response.ok) {
        console.log('Error', data.error);
        return;
    }
    //console.log('Fetched prediction for match', matchid, ':', data)
    return data;

    } catch (error) {
    console.error('Failed to get predictions:', error)
    }
}

export const storePredictions = async (email, matchid, homeGoals, awayGoals, gamemode) => {
    try {
        const score = {home: homeGoals, away: awayGoals}
        const response = await fetch(`https://footballapp-u80w.onrender.com/api/predictions/predict`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                email,
                matchid,
                score,
                gamemode
            })
        })

        const data = await response.json()
        console.log('Prediction saved:', data)
    } catch (error) {
        console.log('Error saving prediction', error)
    }
}

