# Hint windows per song — edit here, then run: python3 scripts/apply-hint-timestamps.py
#
# Rules:
#   Hint 1 (~10s): most instrumental / hardest — avoid iconic riffs, hooks, and vocals
#   Hint 2 (~10s): defining verse or pre-chorus — recognizable but not the main hook
#   Hint 3 (~12s): chorus or the part everyone knows
#
# Times are seconds from track start. YouTube rips may need small tweaks per file.

HINTS_BY_TITLE = {
    "Too Tight": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 210, "duration": 15, "label": "3:30 mark"},
        {"start": 95, "duration": 22, "label": "1:35\u20131:55"},
    ],
    "Ffun": [
        {"start": 18, "duration": 15, "label": "instrumental groove"},
        {"start": 70, "duration": 10, "label": "1:10\u20131:20"},
        {"start": 53, "duration": 17, "label": "0:53\u20131:10"},
    ],
    "Brick House": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 48, "duration": 17, "label": "0:48\u20131:05"},
        {"start": 138, "duration": 20, "label": "2:18\u20132:38"},
    ],
    "Let It Whip": [
        {"start": 2, "duration": 18, "label": "0:02\u20130:20"},
        {"start": 140, "duration": 17, "label": "2:20\u20132:37"},
        {"start": 167, "duration": 15, "label": "2:47\u20133:02"},
    ],
    "Reach For It": [
        {"start": 0, "duration": 10, "label": "0:00\u20130:10"},
        {"start": 109, "duration": 22, "label": "1:49\u20132:11"},
        {"start": 239, "duration": 20, "label": "3:59\u20134:19"},
    ],
    "Back Together Again": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 63, "duration": 17, "label": "1:03\u20131:20"},
        {"start": 190, "duration": 18, "label": "3:10\u20133:28"},
    ],
    "Respect": [
        {"start": 0, "duration": 10, "label": "0:00\u20130:10"},
        {"start": 65, "duration": 14, "label": "1:05\u20131:19"},
        {"start": 110, "duration": 18, "label": "1:50\u20132:08"},
    ],
    "Ain't Nobody": [
        {"start": 2, "duration": 13, "label": "0:02\u20130:15"},
        {"start": 55, "duration": 16, "label": "0:55\u20131:11"},
        {"start": 122, "duration": 19, "label": "2:02\u20132:21"},
    ],
    "Boogie Wonderland": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 168, "duration": 15, "label": "2:48\u20133:03"},
        {"start": 232, "duration": 21, "label": "3:52\u20134:13"},
    ],
    "Word Up": [
        {"start": 16, "duration": 16, "label": "0:16\u20130:32"},
        {"start": 58, "duration": 15, "label": "0:58\u20131:13"},
        {"start": 115, "duration": 19, "label": "1:55\u20132:14"},
    ],
    "Shining Star": [
        {"start": 0, "duration": 13, "label": "0:00\u20130:13"},
        {"start": 61, "duration": 14, "label": "1:01\u20131:15"},
        {"start": 129, "duration": 18, "label": "2:09\u20132:27"},
    ],
    "Before I Let Go": [
        {"start": 11, "duration": 15, "label": "instrumental groove"},
        {"start": 67, "duration": 15, "label": "1:07\u20131:22"},
        {"start": 116, "duration": 22, "label": "1:56\u20132:18"},
    ],
    "Joy & Pain": [
        {"start": 40, "duration": 15, "label": "instrumental groove"},
        {"start": 169, "duration": 15, "label": "2:49\u20133:04"},
        {"start": 292, "duration": 18, "label": "4:52\u20135:10"},
    ],
    "What's Going On": [
        {"start": 7, "duration": 12, "label": "0:07\u20130:19"},
        {"start": 69, "duration": 15, "label": "1:09\u20131:24"},
        {"start": 163, "duration": 18, "label": "2:43\u20133:01"},
    ],
    "Skin Tight": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 180, "duration": 20, "label": "3:00\u20133:20"},
        {"start": 138, "duration": 18, "label": "2:18\u20132:36"},
    ],
    "Live It Up": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 70, "duration": 15, "label": "1:10\u20131:25"},
        {"start": 154, "duration": 20, "label": "2:34\u20132:54"},
    ],
    "You Dropped a Bomb on Me": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 81, "duration": 15, "label": "1:21\u20131:36"},
        {"start": 188, "duration": 18, "label": "3:08\u20133:26"},
    ],
    "Super Freak": [
        {"start": 0, "duration": 10, "label": "0:00\u20130:10"},
        {"start": 108, "duration": 15, "label": "1:48\u20132:03"},
        {"start": 153, "duration": 19, "label": "2:33\u20132:52"},
    ],
    "Mary Jane": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 97, "duration": 17, "label": "1:37\u20131:54"},
        {"start": 120, "duration": 18, "label": "2:00\u20132:18"},
    ],
    "I Got You (I Feel Good)": [
        {"start": 47, "duration": 15, "label": "instrumental groove"},
        {"start": 78, "duration": 14, "label": "1:18\u20131:32"},
        {"start": 0, "duration": 22, "label": "0:00\u20130:22"},
    ],
    "Fantastic Voyage": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 67, "duration": 17, "label": "1:07\u20131:24"},
        {"start": 92, "duration": 18, "label": "1:32\u20131:50"},
    ],
    "Raid": [
        {"start": 93, "duration": 15, "label": "instrumental groove"},
        {"start": 198, "duration": 15, "label": "3:18\u20133:33"},
        {"start": 286, "duration": 18, "label": "4:46\u20135:04"},
    ],
    "More Bounce to the Ounce": [
        {"start": 79, "duration": 15, "label": "instrumental groove"},
        {"start": 143, "duration": 18, "label": "2:23\u20132:41"},
        {"start": 182, "duration": 18, "label": "3:02\u20133:20"},
    ],
    "We Are Family": [
        {"start": 0, "duration": 11, "label": "0:00\u20130:11"},
        {"start": 69, "duration": 19, "label": "1:09\u20131:28"},
        {"start": 152, "duration": 22, "label": "2:32\u20132:54"},
    ],
    "Square Biz": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 179, "duration": 15, "label": "2:59\u20133:14"},
        {"start": 151, "duration": 18, "label": "2:31\u20132:49"},
    ],
    "Flash Light": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 72, "duration": 17, "label": "1:12\u20131:29"},
        {"start": 117, "duration": 18, "label": "1:57\u20132:15"},
    ],
    "I'd Rather Be With You": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 127, "duration": 15, "label": "2:07\u20132:22"},
        {"start": 150, "duration": 18, "label": "2:30\u20132:48"},
    ],
    "Celebration": [
        {"start": 0, "duration": 9, "label": "0:00\u20130:09"},
        {"start": 54, "duration": 11, "label": "0:54\u20131:05"},
        {"start": 99, "duration": 18, "label": "1:39\u20131:57"},
    ],
    "Lowdown": [
        {"start": 10, "duration": 15, "label": "instrumental groove"},
        {"start": 122, "duration": 21, "label": "2:02\u20132:23"},
        {"start": 225, "duration": 18, "label": "3:45\u20134:03"},
    ],
    "Cut the Cake": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 140, "duration": 15, "label": "2:20\u20132:35"},
        {"start": 163, "duration": 18, "label": "2:43\u20133:01"},
    ],
    "Play That Funky Music": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 118, "duration": 15, "label": "1:58\u20132:13"},
        {"start": 211, "duration": 19, "label": "3:31\u20133:50"},
    ],
    "Fame": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 162, "duration": 15, "label": "2:42\u20132:57"},
        {"start": 185, "duration": 18, "label": "3:05\u20133:23"},
    ],
    "The Cisco Kid": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 77, "duration": 20, "label": "1:17\u20131:37"},
        {"start": 180, "duration": 22, "label": "3:00\u20133:22"},
    ],
    "Minute by Minute": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 85, "duration": 16, "label": "1:25\u20131:41"},
        {"start": 157, "duration": 22, "label": "2:37\u20132:59"},
    ],
    "Bennie and the Jets": [
        {"start": 7, "duration": 15, "label": "0:07\u20130:22"},
        {"start": 125, "duration": 17, "label": "2:05\u20132:22"},
        {"start": 192, "duration": 27, "label": "3:12\u20133:39"},
    ],
    "Don't Go Breaking My Heart": [
        {"start": 0, "duration": 8, "label": "0:00\u20130:08"},
        {"start": 50, "duration": 15, "label": "0:50\u20131:05"},
        {"start": 155, "duration": 18, "label": "2:35\u20132:53"},
    ],
    "Babylon Sisters": [
        {"start": 2, "duration": 15, "label": "0:02\u20130:17"},
        {"start": 205, "duration": 17, "label": "3:25\u20133:42"},
        {"start": 160, "duration": 28, "label": "2:40\u20133:08"},
    ],
    "Faith": [
        {"start": 11, "duration": 15, "label": "0:11\u20130:26"},
        {"start": 87, "duration": 15, "label": "1:27\u20131:42"},
        {"start": 119, "duration": 18, "label": "1:59\u20132:17"},
    ],
    "Get Ready": [
        {"start": 2, "duration": 13, "label": "0:02\u20130:15"},
        {"start": 23, "duration": 15, "label": "0:23\u20130:38"},
        {"start": 89, "duration": 18, "label": "1:29\u20131:47"},
    ],
    "24K Magic": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 44, "duration": 15, "label": "0:44\u20130:59"},
        {"start": 116, "duration": 18, "label": "1:56\u20132:14"},
    ],
    "Blame It": [
        {"start": 0, "duration": 11, "label": "0:00\u20130:11"},
        {"start": 41, "duration": 15, "label": "0:41\u20130:56"},
        {"start": 129, "duration": 19, "label": "2:09\u20132:28"},
    ],
    "Don't Talk": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 58, "duration": 17, "label": "0:58\u20131:15"},
        {"start": 124, "duration": 18, "label": "2:04\u20132:22"},
    ],
    "Boo Thang": [
        {"start": 0, "duration": 5, "label": "0:00\u20130:05"},
        {"start": 23, "duration": 15, "label": "0:23\u20130:38"},
        {"start": 46, "duration": 18, "label": "0:46\u20131:04"},
    ],
    "1999": [
        {"start": 3, "duration": 15, "label": "0:03\u20130:18"},
        {"start": 61, "duration": 15, "label": "1:01\u20131:16"},
        {"start": 122, "duration": 18, "label": "2:02\u20132:20"},
    ],
    "Little Red Corvette": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 39, "duration": 8, "label": "0:39\u20130:47"},
        {"start": 91, "duration": 18, "label": "1:31\u20131:49"},
    ],
    "Controversy": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 50, "duration": 15, "label": "0:50\u20131:05"},
        {"start": 161, "duration": 31, "label": "2:41\u20133:12"},
    ],
    "Ruff Ryders' Anthem": [
        {"start": 8, "duration": 11, "label": "0:08\u20130:19"},
        {"start": 40, "duration": 15, "label": "0:40\u20130:55"},
        {"start": 89, "duration": 18, "label": "1:29\u20131:47"},
    ],
    "Changes": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 39, "duration": 18, "label": "0:39\u20130:57"},
        {"start": 148, "duration": 18, "label": "2:28\u20132:46"},
    ],
    "Rock the Bells": [
        {"start": 0, "duration": 10, "label": "0:00\u20130:10"},
        {"start": 50, "duration": 15, "label": "0:50\u20131:05"},
        {"start": 197, "duration": 18, "label": "3:17\u20133:35"},
    ],
    "Push It": [
        {"start": 15, "duration": 10, "label": "0:15\u20130:25"},
        {"start": 38, "duration": 15, "label": "0:38\u20130:53"},
        {"start": 126, "duration": 18, "label": "2:06\u20132:24"},
    ],
    "Walk This Way": [
        {"start": 6, "duration": 15, "label": "instrumental groove"},
        {"start": 53, "duration": 15, "label": "0:53\u20131:08"},
        {"start": 162, "duration": 20, "label": "2:42\u20133:02"},
    ],
    "Don't Believe the Hype": [
        {"start": 0, "duration": 15, "label": "intro"},
        {"start": 96, "duration": 14, "label": "1:36\u20131:50"},
        {"start": 225, "duration": 18, "label": "3:45\u20134:03"},
    ],
    "Summertime": [
        {"start": 2, "duration": 15, "label": "0:02\u20130:17"},
        {"start": 28, "duration": 15, "label": "0:28\u20130:43"},
        {"start": 113, "duration": 19, "label": "1:53\u20132:12"},
    ],
    "Blow the Whistle": [
        {"start": 0, "duration": 10, "label": "0:00\u20130:10"},
        {"start": 67, "duration": 15, "label": "1:07\u20131:22"},
        {"start": 90, "duration": 18, "label": "1:30\u20131:48"},
    ],
    "Hot in Herre": [
        {"start": 2, "duration": 5, "label": "0:02\u20130:07"},
        {"start": 54, "duration": 15, "label": "0:54\u20131:09"},
        {"start": 187, "duration": 19, "label": "3:07\u20133:26"},
    ],
}
