//store Spotify webapp client id
const clientId = "5bb736e0d836446181b75b04d564efa8";

//extract query params from the URL
const params = new URLSearchParams(window.location.search);

//retrieve authorization code from the query parameters
const code = params.get("code");

//get access token from local storage
const storedToken = localStorage.getItem("accessToken");

//clear authorization code on refresh
if (code) {
    history.replaceState(null, "", "/");
}

//If the user is already logged in, attempt to fetch profile,
//otherwise refresh the token and retry fetching the profile
if (storedToken) {
    try {
        const profile = await fetchProfile(storedToken);
        console.log("Profile:", profile);
    } catch (error) {
        console.error("Access token expired or invalid. Refreshing token...");
        const refreshedToken = await refreshAccessToken(clientId);
        const profile = await fetchProfile(refreshedToken);
    }
} else if (!code) {
    redirectToAuthCodeFlow(clientId);
} else {
    const accessToken = await getAccessToken(clientId, code);
    const profile = await fetchProfile(accessToken);
    populateUI(profile);
}

//If authorization code is avaible, echange the code for an access token and fetch profile/liked songs
//Otherwise, redirect to the Spotify authorization flow
if (!code) {
    redirectToAuthCodeFlow(clientId);
} else {
    const accessToken = await getAccessToken(clientId, code);
    const profile = await fetchProfile(accessToken);
    console.log(profile);
    populateUI(profile);

    try {
        const likedTracks = await fetchLikedTracks(accessToken);
        console.log("Liked Tracks:", likedTracks);
        displayTracks(likedTracks);
    } catch (error) {
        console.error("Failed to fetch tracks:", error);
    }

    try {
        const recentTracks = await fetchRecentlyPlayed(accessToken);
        console.log("Recent Tracks:", recentTracks);
        displayRecent(recentTracks);
    } catch (error) {
        console.error("Failed to fetch recent:", error);
    }
    

}

//Redirect the user to Spotify's authorization endpoint to begin the login process
export async function redirectToAuthCodeFlow(clientId: string) {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("scope", "user-read-private user-read-email user-library-read playlist-read-private user-read-recently-played");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

//exchange our authorization code for an access token
export async function getAccessToken(clientId: string, code: string): Promise<string> {
    const verifier = localStorage.getItem("verifier");

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("code_verifier", verifier!);

    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    const data = await result.json();

    if (!result.ok) {
        throw new Error(`Error fetching access token: ${data.error}`);
    }

    localStorage.setItem("accessToken", data.access_token);
    localStorage.setItem("refreshToken", data.refresh_token);

    return data.access_token;
}

//use our refresh token to fetch a new access token
async function refreshAccessToken(clientId: string): Promise<string> {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
        throw new Error("Refresh token not found in localStorage");
    }

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", refreshToken);

    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    const data = await response.json();
    console.log("Refresh Token Response:", data);

    if (!response.ok) {
        throw new Error(`Error refreshing token: ${data.error}`);
    }

    localStorage.setItem("accessToken", data.access_token);

    return data.access_token;
}

//logout function we might use later
function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    document.location = "/";
}

//fetch the user's profile information using the spotify API
async function fetchProfile(token: string): Promise<UserProfile> {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await result.json();
}

//fetch our users liked tracks
async function fetchLikedTracks(token: string): Promise<any> {
    const result = await fetch("https://api.spotify.com/v1/me/tracks?limit=20", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!result.ok) {
        const error = await result.json();
        throw new Error(`Error fetching tracks: ${error.message}`);
    }

    return await result.json();
}

//fetch our users recently played
async function fetchRecentlyPlayed(token: string): Promise<any> {
    const result = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=20", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!result.ok) {
        const error = await result.json();
        throw new Error(`Error fetching recently played: ${error.message}`);
    }

    return await result.json();
}

//update our UI with the user's profile data
function populateUI(profile: UserProfile) {
    document.getElementById("displayName")!.innerText = profile.display_name;
    if (profile.images[0]) {
        const profileImage = new Image(200, 200);
        profileImage.src = profile.images[0].url;
        document.getElementById("avatar")!.appendChild(profileImage);
    }
    document.getElementById("id")!.innerText = profile.id;
    document.getElementById("email")!.innerText = profile.email;
    document.getElementById("uri")!.innerText = profile.uri;
    document.getElementById("uri")!.setAttribute("href", profile.external_urls.spotify);
    document.getElementById("url")!.innerText = profile.href;
    document.getElementById("url")!.setAttribute("href", profile.href);
    document.getElementById("imgUrl")!.innerText = profile.images[0]?.url ?? '(no profile image)';
}

//generate a random string for PKCE
function generateCodeVerifier(length: number) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

//creates a hashed and encoded version of the PKCE code verifier
async function generateCodeChallenge(codeVerifier: string) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

//display users liked tracks
function displayTracks(tracksData: any) {
    const tracksContainer = document.getElementById("tracks")!;
    tracksContainer.innerHTML = ""; 

    const items = tracksData.items;

    items.forEach((item: any) => {
        const track = item.track;
        const trackInfo = `
            <p>
                <img src="${track.album.images[0]?.url}" alt="Album cover" width="100" height="100" style="vertical-align:middle; margin-right:10px;">
                <strong>${track.name}</strong> by ${track.artists.map((a: any) => a.name).join(", ")}
            </p>
        `;
        tracksContainer.innerHTML += trackInfo; 
    });
}

//display users recently played
function displayRecent(recentData: any) {
    const recentContainer = document.getElementById("recent")!;
    recentContainer.innerHTML = ""; 

    const items = recentData.items;

    items.forEach((item: any) => {
        const recent = item.track;
        const recentInfo = `
            <p>
                <img src="${recent.album.images[0]?.url}" alt="Album cover" width="100" height="100" style="vertical-align:middle; margin-right:10px;">
                <strong>${recent.name}</strong> by ${recent.artists.map((a: any) => a.name).join(", ")}
            </p>
        `;
        recentContainer.innerHTML += recentInfo; 
    });
}