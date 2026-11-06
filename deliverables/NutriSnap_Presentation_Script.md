# NutriSnap – Presenter Script

CSC10014 – Computational Thinking · FIT-HCMUS · Mid-term presentation

- 24 slides, about 14–15 minutes. Part 3 (UI/UX and system) is the longest part.
- This text is the same as the speaker notes in NutriSnap_Project_Presentation.pptx.
- Suggested split for 6 speakers: slides 1–4 Việt Huy · 5–8 Khôi Nguyên · 9–12 Thành Đạt · 13–16 Minh Đức · 17–20 Phú Hiếu · 21–24 Quốc Tuấn.
- Tip: on UI slides, point at each phone while you talk about it.

## Slide 1 – Title

*Introduction*

Good morning, teachers and everyone. We are team NutriSnap. I am Việt Huy, the team leader, and with me are Khôi Nguyên, Thành Đạt, Minh Đức, Phú Hiếu and Quốc Tuấn. NutriSnap is a mobile app that lets you snap a photo of your meal, know its nutrition, and build healthier daily habits.
## Slide 2 – Meet our team

*Introduction*

Let me introduce our team. We have six members. I am Việt Huy, the team leader. With me are Khôi Nguyên, Thành Đạt, Minh Đức, Phú Hiếu and Quốc Tuấn. Together we designed the UI, wrote the functions and built the working prototype you will see today. A quick note on progress: the course asks for UI design, a function list, a use case diagram and a coding plan at this stage. We have done all of these, and we also have a working app on a real Android phone, so every screen in this presentation is a real screen.
## Slide 3 – Section – Part 1: Product Overview

*Part 1 – Product Overview*

Let us begin with Part one: the product, and the story behind it.
## Slide 4 – Meet Minh Anh – a story many students know

*Part 1 – Product Overview*

Meet Minh Anh. She is a persona we created from our own experience as students. On day one she is motivated and wants to eat better on fifty thousand đồng a day. On day three she is tired of searching for every dish and guessing the grams. On day five she gives up. This happens to many of us. The problem is not motivation; the problem is that logging takes too long, local dishes like phở or cơm tấm are hard to find, and numbers from chatbots are not always trustworthy. So our mission is simple: make healthy tracking take seconds, not minutes.
## Slide 5 – Who NutriSnap is designed for

*Part 1 – Product Overview*

NutriSnap is designed for three main groups. Students who want healthy food on a small budget. Office workers who want to lose weight safely. And gym-goers who need enough protein to build muscle. Each group has its own goal, so the app builds a personal plan for each person. In fact, our three demo accounts are exactly these three personas.
## Slide 6 – Meet NutriSnap: Snap → Confirm → Coach

*Part 1 – Product Overview*

So what is NutriSnap? It is three simple steps. Snap: take a photo of your meal, and the app recognises the dishes. Confirm: you check the dishes and the grams, and nothing is saved before you agree. Coach: a friendly AI coach answers your questions using your own data. The screens here are from our real app.
## Slide 7 – User flow: from opening the app to getting advice

*Part 1 – Product Overview*

Here is the user flow in five steps. One: the user opens the app and logs in, and their personal goal is ready. Two: they snap a photo of the meal or search a dish. Three: they confirm the dishes and the grams. Four: they see their progress – calories, macros and their streak. And five: they get advice from the AI coach or a healthier food swap. Then the loop starts again at the next meal.
## Slide 8 – Core features and their status

*Part 1 – Product Overview*

These are our six core features, and all of them already work in our prototype: food logging by photo or manual search, nutrition and calorie tracking, goals and profile, suggestions from the AI coach and food swaps, habits and reports, and lock-screen meal reminders.
## Slide 9 – Section – Part 2: Market

*Part 2 – Market*

Part two: the market, and where NutriSnap stands.
## Slide 10 – Target market and user problems

*Part 2 – Market*

Our target market is young Vietnamese people who use their phones every day and care about health. They face four problems: nutrition numbers are hard to understand, manual tracking is inconvenient, they do not know their daily needs, and Vietnamese food is poorly covered by international apps.
## Slide 11 – How we compare

*Part 2 – Market*

We compared NutriSnap with three popular apps: MyFitnessPal, YAZIO and Cronometer. They are strong products with big databases and nice plans, but logging is mostly search and barcode, Vietnamese dishes are limited, and many features are paid. This comparison is our team's own assessment based on public product descriptions.
## Slide 12 – Our positioning: what sets us apart

*Part 2 – Market*

This map shows our positioning. Horizontally is how much effort logging takes; vertically is how well the app fits Vietnamese food. Most apps sit on the high-effort side. NutriSnap aims for the top-left corner: low effort and a strong local fit. Three things set us apart: photo-first logging with a confirm step, a curated Vietnamese food table together with USDA data, and a coach that understands your own goals.
## Slide 13 – Section – Part 3: Engineering

*Part 3 – Engineering*

Part three is engineering. Here we focus on the UI and UX, the workflow, and our system plan.
## Slide 14 – Design system and consistency

*Part 3 – Engineering*

First, consistency. Every screen uses the same design system. One fresh green as the main colour with warm accents, rounded cards, large readable numbers, and one raised camera button that is always in the same place. Our mascot, a little camera with a lime lens, appears in eight moods to guide and encourage the user. The app also has a full dark mode, and both themes use the same layout so users never feel lost.
## Slide 15 – UI · Onboarding

*Part 3 – Engineering*

This is onboarding. The login and register screens share the same style. Then the goal wizard asks for body data, the goal and activity level in four short steps, one question group per screen. At the end it shows a safe weekly pace, so users do not set extreme goals.
## Slide 16 – UI · Core loop

*Part 3 – Engineering*

This is the core loop. From the camera screen the user can upload a photo or search a dish manually. The review screen shows each dish with its grams, which the user can edit, and the totals update right away. If the photo is not food, the app says: this is not a dish, please take the photo again, and returns to the camera.
## Slide 17 – UI · Daily dashboard

*Part 3 – Engineering*

The dashboard is the home screen. It shows calories eaten and calories left in a big ring, then protein, carbs and fat. The mascot greets the user, and the same screen works in light and dark mode.
## Slide 18 – UI · Habits, progress and reports

*Part 3 – Engineering*

For motivation and insights, the habit screen shows the streak, a seven-day challenge and badges. The progress screen shows the weight trend over seven to ninety days. The monthly report can be exported as an image or a PDF to share.
## Slide 19 – UI · AI coach, reminders and admin

*Part 3 – Engineering*

The AI coach is always one tap away in the header. It answers in Vietnamese or English, and it politely refuses topics outside nutrition. Lock-screen reminders with mascots appear when a meal is missing. And for managing the app, an admin account has its own panel with user statistics and tools.
## Slide 20 – Workflow: function list and use case diagram

*Part 3 – Engineering*

Here is our function list on the left and our use case diagram on the right. The user manages an account, sets goals, logs meals, records weight, views progress and asks the assistant. Logging a meal includes photo recognition and the confirm step. Each function plugs into the same daily loop: plan, log, review, improve.
## Slide 21 – Core pipelines

*Part 3 – Engineering*

These are our three core pipelines. One: snap to nutrition – photo, recognise dishes, match them to our food tables, calculate, confirm, save. Two: the personal goal planner – body data, energy needs, a calorie and macro target, and a safe pace check. Three: the AI coach – the question, the user's own data, a grounded answer and a safety check. In all three, the AI helps to understand, but the numbers always come from the food database.
## Slide 22 – System architecture

*Part 3 – Engineering*

This is our system architecture. On the left is the mobile app. It sends secure requests to the backend server in the cloud. The server handles login, rules and every calculation. It stores and reads data in the database, sends photos and questions to the Gemini AI, and uses our nutrition data: about five hundred Vietnamese dishes and the USDA database. The key rule is simple: the AI understands, the database calculates.
## Slide 23 – System overview: how it all works

*Part 3 – Engineering*

This is a brief overview of how the system works. The mobile app shows screens and collects input. The backend server handles the rules and every calculation. Data comes from a Vietnamese dish table and USDA FoodData Central and is stored in a cloud database. The AI only reads photos and questions. For security, login uses protected cookies, each person can only see their own data, and admins are separated from normal users.
## Slide 24 – How NutriSnap will grow – and thank you

*Part 3 – Engineering*

Finally, how NutriSnap will grow. We build in small steps: design, build, test with users, and improve. Next we will apply your feedback, measure how accurate the recognition is, add a barcode scanner for packaged food and a water tracker, and prepare a public Android release. Thank you very much for listening. We are happy to answer your questions.

---

## Before presenting

- Open the app once before the talk so the server is awake.
- Use demo accounts only (student_user, office_user, gym_user).
- If the live demo is slow, use the screenshots in the slides.
