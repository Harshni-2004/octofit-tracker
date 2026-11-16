import { Activity, Team, User, Workout } from '../models/index.js';
import mongoose from 'mongoose';

function assertRequestBody(input: unknown): asserts input is Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Invalid request body'), { status: 400 });
  }
}

async function createWithValidation<T>(create: () => Promise<T>): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
      throw Object.assign(new Error(error.message), { status: 400 });
    }
    throw error;
  }
}

export async function listActivities() {
  return Activity.find().lean();
}

export async function createActivity(input: unknown) {
  assertRequestBody(input);
  const body = input;

  if (!body.userId || !body.teamId || !body.type || body.minutes === undefined) {
    throw Object.assign(new Error('Missing required fields: userId, teamId, type, minutes'), { status: 400 });
  }

  if (typeof body.userId !== 'string' || !mongoose.Types.ObjectId.isValid(body.userId)) {
    throw Object.assign(new Error('Invalid userId format'), { status: 400 });
  }

  if (typeof body.teamId !== 'string' || !mongoose.Types.ObjectId.isValid(body.teamId)) {
    throw Object.assign(new Error('Invalid teamId format'), { status: 400 });
  }

  const user = await User.findById(body.userId);
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 400 });
  }

  const team = await Team.findById(body.teamId);
  if (!team) {
    throw Object.assign(new Error('Team not found'), { status: 400 });
  }

  const points = (body.minutes as number) || 0;
  const activity = await createWithValidation(() => Activity.create({
    user: body.userId,
    team: body.teamId,
    type: body.type,
    minutes: body.minutes,
    points,
    occurredAt: new Date(),
  }));

  return activity.toObject();
}

export async function listTeams() {
  return Team.find().lean();
}

export async function createTeam(input: unknown) {
  assertRequestBody(input);
  const body = input;

  if (!body.name) {
    throw Object.assign(new Error('Missing required field: name'), { status: 400 });
  }

  if (!body.mascot) {
    throw Object.assign(new Error('Missing required field: mascot'), { status: 400 });
  }

  const members = Array.isArray(body.members) ? body.members : [];
  
  const team = await createWithValidation(() => Team.create({
    name: body.name,
    mascot: body.mascot,
    members,
  }));

  return team.toObject();
}

export async function getLeaderboard() {
  const totals = await Activity.aggregate([
    {
      $group: {
        _id: '$team',
        totalPoints: { $sum: '$points' },
      },
    },
    {
      $sort: { totalPoints: -1 },
    },
  ]);

  const teamIds = totals.map((entry) => entry._id);
  const teams = await Team.find({ _id: { $in: teamIds } }).lean();
  const teamMap = new Map(teams.map((team) => [team._id.toString(), team]));

  return totals.map((entry, index) => ({
    teamName: teamMap.get(entry._id.toString())?.name || '',
    totalPoints: entry.totalPoints,
    rank: index + 1,
  }));
}

export async function suggestWorkouts(userEmail: string) {
  const user = await User.findOne({ email: userEmail });
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const activities = await Activity.find({ user: user._id }).lean();
  
  const activityTypes = new Set(activities.map((a) => a.type));
  const userGoal = user.fitnessGoal;

  const workouts = await Workout.find().lean();

  const scoredWorkouts = workouts.map((workout) => {
    let score = 0;
    let reason = '';

    if (workout.focus === userGoal) {
      score += 100;
      reason = `Your fitness goal is ${userGoal}`;
    }

    if (activityTypes.has(workout.focus)) {
      score += 50;
      if (reason) reason += ` and you have done ${workout.focus} activities`;
      else reason = `You have done ${workout.focus} activities`;
    }

    if (score === 0) {
      score = 10;
      reason = 'Popular workout';
    }

    return { ...workout, score, reason };
  });

  const sorted = scoredWorkouts.sort((a, b) => b.score - a.score);
  return sorted.map(({ score, ...rest }) => rest);
}

export { User };
