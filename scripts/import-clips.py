#!/usr/bin/env python3
"""Copy songs from Downloads into clips/ with playlist naming."""

import shutil
from pathlib import Path

SOURCE = Path("/Users/grim/Downloads/4thofJulyMusic")
DEST = Path(__file__).resolve().parent.parent / "clips"

# Explicit mapping: playlist id -> source filename
MAPPING = {
    "song-01": "Too Tight.mp3",
    "song-02": "Ffun.mp3",
    "song-03": "Commodores - Brick House (Audio).mp3",
    "song-04": "Let It Whip (Single Version).mp3",
    "song-05": "George Duke   Reach For It.mp3",
    "song-06": "Back Together Again (feat. Donny Hathaway).mp3",
    "song-07": "Aretha Franklin - Respect (Official Lyric Video).mp3",
    "song-08": "Rufus and Chaka Khan - Ain't Nobody [HD Remaster] (Official Video).mp3",
    "song-09": "Earth, Wind & Fire, The Emotions - Boogie Wonderland (Audio).mp3",
    "song-10": "Cameo - Word Up (Relaid Audio) (Official Music Video).mp3",
    "song-11": "Earth, Wind & Fire - Shining Star (Official Audio).mp3",
    "song-12": "Before I Let Go.mp3",
    "song-13": "Joy & Pain.mp3",
    "song-14": "Marvin Gaye - What's Going On.mp3",
    "song-15": "Skin Tight.mp3",
    "song-16": "Live It Up, Pts. 1 & 2.mp3",
    "song-17": "Gap Band - You Dropped A Bomb On Me.mp3",
    "song-18": "Rick James - Super Freak (Official Music Video).mp3",
    "song-19": "Mary Jane.mp3",
    "song-20": "James Brown - I Got You (I Feel Good) (Visualizer).mp3",
    "song-21": "Lakeside - Fantastic Voyage (Official Music Video).mp3",
    "song-22": "Lakeside - Raid.mp3",
    "song-23": "Zapp & Roger - More Bounce to the Ounce.mp3",
    "song-24": "Sister Sledge - We Are Family.mp3",
    "song-25": "Teena Marie - Square Biz.mp3",
    "song-26": "Parliament - Flashlight (HQ).mp3",
    "song-27": "Bootsy Collins - I'd Rather Be With You.mp3",
    "song-28": "Celebration.mp3",
    "song-29": "Boz Scaggs - Lowdown (Audio).mp3",
    "song-30": "Average White Band - Cut The Cake.mp3",
    "song-31": "Wild Cherry - Play That Funky Music (Audio).mp3",
    "song-32": "Fame (2016 Remaster) - David Bowie.mp3",
    "song-33": "The Cisco Kid.mp3",
    "song-34": "The Doobie Brothers - Minute By Minute (Official Music Video) [HD].mp3",
    "song-35": "Bennie And The Jets.mp3",
    "song-36": "Don't Go Breaking My Heart (Remastered).mp3",
    "song-37": "Steely Dan - Babylon Sisters - HQ Audio -- LYRICS.mp3",
    "song-38": "Faith - George Michael.mp3",
    "song-39": "Rare Earth - Get Ready (Single Version) HQ.mp3",
    "song-40": "Bruno Mars - 24K Magic (Official Music Video).mp3",
    "song-41": "Jamie Foxx Featuring T-Pain - Blame It (On the Alcohol).mp3",
    "song-42": "Jon B. -Dont Talk.mp3",
    "song-43": "Paul Russell - Lil Boo Thang (Lyric Video).mp3",
    "song-44": "Prince - 1999 (Official Music Video).mp3",
    "song-45": "Prince - Little Red Corvette (Official Music Video).mp3",
    "song-46": "Prince - Controversy (Official Music Video).mp3",
    "song-47": "DMX - Ruff Ryders' Anthem.mp3",
    "song-48": "2Pac - Changes ft. Talent.mp3",
    "song-49": "LL Cool J - Rock the Bells (HQ).mp3",
    "song-50": "Salt N Pepa - Push It (Original).mp3",
    "song-51": "RUN D.M.C. feat. AEROSMITH - WALK THIS WAY.mp3",
    "song-52": "Don't Believe The Hype.mp3",
    "song-53": "DJ Jazzy Jeff & The Fresh Prince - Summertime (Official Video).mp3",
    "song-54": "Too $hort - Blow the Whistle (Official Audio).mp3",
    "song-55": "Nelly - Hot In Herre (Official Music Video).mp3",
}


def main():
    DEST.mkdir(exist_ok=True)

    for old_wav in DEST.glob("song-*-hint*.wav"):
        old_wav.unlink()
        print(f"removed old demo {old_wav.name}")

    for song_id, filename in MAPPING.items():
        src = SOURCE / filename
        dst = DEST / f"{song_id}.mp3"
        if not src.exists():
            raise FileNotFoundError(f"Missing source file: {src}")
        shutil.copy2(src, dst)
        print(f"{filename} -> {dst.name}")

    print(f"\nDone: {len(MAPPING)} songs in {DEST}")


if __name__ == "__main__":
    main()
