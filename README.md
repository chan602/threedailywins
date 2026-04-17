# Three Wins

A full-stack productivity web app designed to help users intentionally structure their day around three core areas of well-being: physical, mental, and spiritual.

## Overview

Three Wins is built around a simple idea: each day, aim to achieve one physical, one mental, and one spiritual “win.” Rather than focusing purely on productivity, this framework encourages balanced, sustainable progress across multiple dimensions of life.

This project originated from my own workflow. After experimenting with traditional to-do lists and AI-based task tracking, I found that:
- Structured task systems require strict, deterministic logic
- AI is powerful for reflection, but unreliable for managing state

Three Wins is a hybrid solution that combines both:
- A **rigid, reliable task management system**
- An **AI-powered evaluation layer** that runs after task completion

## Features

-  Google Authentication (Firebase Auth)
-  Per-user daily and weekly task management
-  AI-powered evaluation of “Three Wins” (Anthropic API)
-  Streak tracking and leaderboard system
-  User profiles with public visibility options
-  Inline task editing and archive management
-  Persistent task archive with evaluation history

## Tech Stack

- **Frontend:** React + Vite
- **Backend / Database:** Firebase (Firestore, Auth)
- **AI Integration:** Anthropic API
- **Hosting:** Firebase Hosting

## Architecture Highlights

- **Separation of concerns:**  
  Task management is handled deterministically in the frontend + Firestore, while AI is used strictly for post hoc evaluation.

- **Scalable data model:**  
  Per-user collections for tasks and archives, with planned expansion into social and group features.

- **Security-first design:**  
  Firestore security rules enforce user-level data isolation, with planned Cloud Functions for controlled public data access.

## Motivation

As a biochemistry student with an interest in medicine and human performance, I wanted to build a system that reflects how people actually function — not just as productivity machines, but as individuals balancing physical health, mental growth, and personal meaning.

Three Wins is an attempt to translate that philosophy into a practical, scalable tool.

## Roadmap

- [ ] Refine Firestore security rules + public profile access
- [ ] Expand social features (friends, visibility)
- [ ] Improve AI evaluation customization
- [ ] Explore calendar integration and scheduling
- [ ] Mobile optimization and PWA enhancements

## Live Demo

[https://threedailywins.com](https://threedailywins.com)

## Author

Nathan Chan  
University of Washington — Biochemistry

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
